//! Building and composing visualizer trees.
//!
//! A tree is built from the active tiles/effects each frame and stored in
//! `DisplayRenderTarget.visualizer_tree`. Tile amounts and crossfade factors
//! are baked into `Lerp.t` values during construction, so once the tree exists
//! the renderer never needs to look back at tiles or effect state. Uniforms are
//! computed once from the final display state and shared by every node.

use crate::proto::visualizer_node::Node;
use crate::proto::{VisualizerLerp, VisualizerNode, VisualizerSequence};

impl VisualizerNode {
    #[must_use]
    pub fn leaf(id: u64) -> Self {
        Self {
            node: Some(Node::Leaf(id)),
        }
    }

    #[must_use]
    pub fn black() -> Self {
        Self {
            node: Some(Node::BlackBuffer(true)),
        }
    }

    #[must_use]
    pub fn sequence(nodes: Vec<VisualizerNode>) -> Self {
        Self {
            node: Some(Node::Sequence(VisualizerSequence { nodes })),
        }
    }

    #[must_use]
    pub fn lerp(a: VisualizerNode, b: VisualizerNode, t: f32) -> Self {
        Self {
            node: Some(Node::Lerp(Box::new(VisualizerLerp {
                a: Some(Box::new(a)),
                b: Some(Box::new(b)),
                t,
            }))),
        }
    }

    fn is_black(&self) -> bool {
        matches!(&self.node, Some(Node::BlackBuffer(_)) | None)
    }
}

/// Build the tree for a single effect state's visualizers. Multiple IDs form a
/// Sequence (output of each feeds the next).
#[must_use]
pub fn build_effect_visualizer_tree(visualizer_ids: &[u64]) -> Option<VisualizerNode> {
    match visualizer_ids {
        [] => None,
        [id] => Some(VisualizerNode::leaf(*id)),
        ids => Some(VisualizerNode::sequence(
            ids.iter().map(|&id| VisualizerNode::leaf(id)).collect(),
        )),
    }
}

/// Build the tree for interpolating between two effect states (e.g. ramps,
/// crossfades). When both sides are structurally identical, a single render
/// suffices (the interpolated uniforms handle the visual difference).
#[must_use]
pub fn build_interpolated_tree(
    state_a: Option<VisualizerNode>,
    state_b: Option<VisualizerNode>,
    t: f32,
) -> Option<VisualizerNode> {
    match (state_a, state_b) {
        (None, None) => None,
        (Some(a), None) => Some(VisualizerNode::lerp(a, VisualizerNode::black(), t)),
        (None, Some(b)) => Some(VisualizerNode::lerp(VisualizerNode::black(), b, t)),
        (Some(a), Some(b)) if trees_equal(&a, &b) => Some(a),
        (Some(a), Some(b)) => Some(VisualizerNode::lerp(a, b, t)),
    }
}

/// Combine multiple tile trees with their amounts baked in. Tiles are applied in
/// order: `result = lerp(lerp(lerp(black, A, amtA), B, amtB), C, amtC)`.
#[must_use]
pub fn build_tile_composite_tree(tiles: &[(VisualizerNode, f32)]) -> Option<VisualizerNode> {
    let mut result = VisualizerNode::black();

    for (tree, amount) in tiles {
        if *amount <= 0.0 {
            continue;
        }
        if *amount >= 1.0 {
            result = tree.clone();
        } else {
            result = VisualizerNode::lerp(result, tree.clone(), *amount);
        }
    }

    if result.is_black() {
        None
    } else {
        Some(result)
    }
}

/// Structural equality used to decide whether interpolation needs two renders.
/// Lerp nodes are never considered equal (their `t` always matters).
fn trees_equal(a: &VisualizerNode, b: &VisualizerNode) -> bool {
    match (&a.node, &b.node) {
        (Some(Node::Leaf(id_a)), Some(Node::Leaf(id_b))) => id_a == id_b,
        (Some(Node::BlackBuffer(_)) | None, Some(Node::BlackBuffer(_)) | None) => true,
        (Some(Node::Sequence(seq_a)), Some(Node::Sequence(seq_b))) => {
            seq_a.nodes.len() == seq_b.nodes.len()
                && seq_a
                    .nodes
                    .iter()
                    .zip(&seq_b.nodes)
                    .all(|(a, b)| trees_equal(a, b))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_id_builds_leaf() {
        let tree = build_effect_visualizer_tree(&[7]).unwrap();
        assert!(matches!(tree.node, Some(Node::Leaf(7))));
    }

    #[test]
    fn multiple_ids_build_sequence() {
        let tree = build_effect_visualizer_tree(&[1, 2, 3]).unwrap();
        match tree.node {
            Some(Node::Sequence(seq)) => assert_eq!(seq.nodes.len(), 3),
            other => panic!("expected sequence, got {other:?}"),
        }
    }

    #[test]
    fn empty_ids_build_none() {
        assert!(build_effect_visualizer_tree(&[]).is_none());
    }

    #[test]
    fn identical_states_render_once() {
        let a = VisualizerNode::leaf(1);
        let b = VisualizerNode::leaf(1);
        let tree = build_interpolated_tree(Some(a), Some(b), 0.5).unwrap();
        assert!(matches!(tree.node, Some(Node::Leaf(1))));
    }

    #[test]
    fn different_states_build_lerp() {
        let tree = build_interpolated_tree(
            Some(VisualizerNode::leaf(1)),
            Some(VisualizerNode::leaf(2)),
            0.5,
        )
        .unwrap();
        assert!(matches!(tree.node, Some(Node::Lerp(_))));
    }

    #[test]
    fn fade_in_uses_black_side() {
        let tree =
            build_interpolated_tree(None, Some(VisualizerNode::leaf(2)), 0.25).unwrap();
        match tree.node {
            Some(Node::Lerp(lerp)) => {
                assert!(lerp.a.unwrap().is_black());
                assert!((lerp.t - 0.25).abs() < f32::EPSILON);
            }
            other => panic!("expected lerp, got {other:?}"),
        }
    }

    #[test]
    fn tile_composite_skips_inactive_and_nests() {
        let tiles = vec![
            (VisualizerNode::leaf(1), 0.0),
            (VisualizerNode::leaf(2), 0.5),
            (VisualizerNode::leaf(3), 0.5),
        ];
        let tree = build_tile_composite_tree(&tiles).unwrap();
        // Outer lerp blends (lerp(black, 2)) with 3.
        match tree.node {
            Some(Node::Lerp(outer)) => {
                assert!((outer.t - 0.5).abs() < f32::EPSILON);
                assert!(matches!(outer.b.unwrap().node, Some(Node::Leaf(3))));
            }
            other => panic!("expected lerp, got {other:?}"),
        }
    }

    #[test]
    fn tile_composite_full_amount_replaces() {
        let tiles = vec![(VisualizerNode::leaf(1), 1.0)];
        let tree = build_tile_composite_tree(&tiles).unwrap();
        assert!(matches!(tree.node, Some(Node::Leaf(1))));
    }

    #[test]
    fn tile_composite_all_inactive_is_none() {
        let tiles = vec![(VisualizerNode::leaf(1), 0.0)];
        assert!(build_tile_composite_tree(&tiles).is_none());
    }
}

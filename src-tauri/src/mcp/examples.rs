// Example tiles for AI learning
//
// These examples are baked into the application to help the AI understand
// common lighting patterns and how to create appropriate tile configurations.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileExample {
    pub id: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub tile_json: Value,
}

/// Get all example tiles
pub fn get_examples() -> Vec<TileExample> {
    vec![
        TileExample {
            id: "red_wash".to_string(),
            description: "A static red wash at full brightness on all fixtures".to_string(),
            category: "static".to_string(),
            tags: vec!["red".to_string(), "wash".to_string(), "full".to_string()],
            tile_json: serde_json::json!({
                "name": "Red Wash",
                "one_shot": false,
                "duration_beats": 1.0,
                "fade_in_ms": 100,
                "fade_out_ms": 500,
                "channels": [{
                    "effect": {
                        "type": "static",
                        "state": {
                            "color": {"r": 255, "g": 0, "b": 0, "w": 0},
                            "dimmer": 1.0
                        }
                    },
                    "output_target": {
                        "type": "patch",
                        "id": "0"  // Active patch - all fixtures
                    }
                }]
            }),
        },
        TileExample {
            id: "blue_breathing".to_string(),
            description: "A slow breathing effect that pulses blue light from 20% to 100% over 4 beats".to_string(),
            category: "breathing".to_string(),
            tags: vec!["blue".to_string(), "pulse".to_string(), "slow".to_string(), "breathing".to_string()],
            tile_json: serde_json::json!({
                "name": "Blue Breath",
                "one_shot": false,
                "duration_beats": 4.0,
                "fade_in_ms": 100,
                "fade_out_ms": 500,
                "channels": [{
                    "effect": {
                        "type": "ramp",
                        "state_start": {
                            "color": {"r": 0, "g": 0, "b": 255, "w": 0},
                            "dimmer": 0.2
                        },
                        "state_end": {
                            "color": {"r": 0, "g": 0, "b": 255, "w": 0},
                            "dimmer": 1.0
                        },
                        "timing": {
                            "beat_multiplier": 1.0,
                            "easing": "ease_in_out",
                            "mirrored": true,
                            "phase": 0.0
                        }
                    },
                    "output_target": {
                        "type": "patch",
                        "id": "0"
                    }
                }]
            }),
        },
        TileExample {
            id: "white_strobe".to_string(),
            description: "A fast white strobe effect flashing on and off rapidly".to_string(),
            category: "strobe".to_string(),
            tags: vec!["white".to_string(), "strobe".to_string(), "fast".to_string(), "flash".to_string()],
            tile_json: serde_json::json!({
                "name": "White Strobe",
                "one_shot": false,
                "duration_beats": 1.0,
                "fade_in_ms": 0,
                "fade_out_ms": 100,
                "channels": [{
                    "effect": {
                        "type": "strobe",
                        "state_a": {
                            "color": {"r": 255, "g": 255, "b": 255, "w": 255},
                            "dimmer": 1.0
                        },
                        "state_b": {
                            "color": {"r": 0, "g": 0, "b": 0, "w": 0},
                            "dimmer": 0.0
                        },
                        "state_a_frames": 2,
                        "state_b_frames": 2
                    },
                    "output_target": {
                        "type": "patch",
                        "id": "0"
                    }
                }]
            }),
        },
        TileExample {
            id: "rainbow_ramp".to_string(),
            description: "A rainbow color change that smoothly transitions from red to blue over 8 beats".to_string(),
            category: "color_change".to_string(),
            tags: vec!["rainbow".to_string(), "color".to_string(), "transition".to_string(), "smooth".to_string()],
            tile_json: serde_json::json!({
                "name": "Rainbow",
                "one_shot": false,
                "duration_beats": 8.0,
                "fade_in_ms": 200,
                "fade_out_ms": 500,
                "channels": [{
                    "effect": {
                        "type": "ramp",
                        "state_start": {
                            "color": {"r": 255, "g": 0, "b": 0, "w": 0},
                            "dimmer": 1.0
                        },
                        "state_end": {
                            "color": {"r": 0, "g": 0, "b": 255, "w": 0},
                            "dimmer": 1.0
                        },
                        "timing": {
                            "beat_multiplier": 1.0,
                            "easing": "linear",
                            "mirrored": false,
                            "phase": 0.0
                        }
                    },
                    "output_target": {
                        "type": "patch",
                        "id": "0"
                    }
                }]
            }),
        },
        TileExample {
            id: "dimmer_buildup".to_string(),
            description: "A buildup effect that gradually increases brightness from 0% to 100% over 16 beats".to_string(),
            category: "buildup".to_string(),
            tags: vec!["buildup".to_string(), "crescendo".to_string(), "intensity".to_string()],
            tile_json: serde_json::json!({
                "name": "Buildup",
                "one_shot": true,  // One-shot: plays once when triggered
                "duration_beats": 16.0,
                "fade_in_ms": 0,
                "fade_out_ms": 0,
                "channels": [{
                    "effect": {
                        "type": "ramp",
                        "state_start": {
                            "color": {"r": 255, "g": 255, "b": 255, "w": 255},
                            "dimmer": 0.0
                        },
                        "state_end": {
                            "color": {"r": 255, "g": 255, "b": 255, "w": 255},
                            "dimmer": 1.0
                        },
                        "timing": {
                            "beat_multiplier": 1.0,
                            "easing": "ease_in",
                            "mirrored": false,
                            "phase": 0.0
                        }
                    },
                    "output_target": {
                        "type": "patch",
                        "id": "0"
                    }
                }]
            }),
        },
        TileExample {
            id: "impact_flash".to_string(),
            description: "A sudden bright white flash for dramatic impact moments".to_string(),
            category: "impact".to_string(),
            tags: vec!["flash".to_string(), "impact".to_string(), "sudden".to_string(), "bright".to_string()],
            tile_json: serde_json::json!({
                "name": "Impact",
                "one_shot": true,
                "duration_beats": 0.25,
                "fade_in_ms": 0,
                "fade_out_ms": 200,
                "channels": [{
                    "effect": {
                        "type": "static",
                        "state": {
                            "color": {"r": 255, "g": 255, "b": 255, "w": 255},
                            "dimmer": 1.0
                        }
                    },
                    "output_target": {
                        "type": "patch",
                        "id": "0"
                    }
                }]
            }),
        },
    ]
}

/// Get examples by category
pub fn get_examples_by_category(category: &str) -> Vec<TileExample> {
    get_examples()
        .into_iter()
        .filter(|ex| ex.category == category)
        .collect()
}

/// Search examples by tags
pub fn search_examples(query: &str) -> Vec<TileExample> {
    let query_lower = query.to_lowercase();
    get_examples()
        .into_iter()
        .filter(|ex| {
            ex.description.to_lowercase().contains(&query_lower)
                || ex.category.to_lowercase().contains(&query_lower)
                || ex.tags.iter().any(|tag| tag.to_lowercase().contains(&query_lower))
        })
        .collect()
}

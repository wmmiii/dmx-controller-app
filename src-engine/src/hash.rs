use std::hash::{DefaultHasher, Hash, Hasher};

pub(crate) fn hash64(value: u64) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

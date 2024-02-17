use dmx_controller_proto::{FixtureDefinition};
use wasm_bindgen::prelude::*;

pub fn main() {
    println!("Main");
}

#[wasm_bindgen]
pub fn hello_world() -> String {
  let mut definition = FixtureDefinition::new();
  definition.set_name("foo".into());

  return "TEST".into();
}

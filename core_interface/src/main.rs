use wasm_bindgen::prelude::*;

pub fn main() {
    println!("Main");
}

#[wasm_bindgen]
pub fn hello_world() -> u8 {
  return 42;
}


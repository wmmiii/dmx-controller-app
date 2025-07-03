extern crate core_lib;

fn main() {
    println!("{}", core_lib::hello_world());
    println!("{}", add(1, 2));
}

pub fn add(a: i32, b: i32) -> i32 {
    core_lib::add(a, b)
}

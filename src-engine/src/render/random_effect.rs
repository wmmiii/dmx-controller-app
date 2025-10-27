use once_cell::sync::Lazy;

use crate::{
    proto::{effect::RandomEffect, ColorPalette, OutputTarget, Project},
    render::{render_target::RenderTarget, util::apply_effect},
};

pub fn apply_random_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: &u64,
    frame: &u32,
    seed: &u64,
    ms_since_start: &u64,
    effect_duration_ms: &u64,
    beat_t: &f64,
    random_effect: &RandomEffect,
    color_palette: &ColorPalette,
) {
    let random_number_half = (get_random_numbers().len() / 2) as f64;
    let window_size = get_odd_sum() * random_effect.effect_a_variation as f64
        + (random_number_half * random_effect.effect_a_min as f64)
        + get_even_sum() * random_effect.effect_b_variation as f64
        + (random_number_half * random_effect.effect_b_min as f64);

    let effect_t = system_t
        .wrapping_add(random_effect.seed as u64)
        .wrapping_add(*seed)
        .wrapping_add(LARGE_PRIME)
        % window_size as u64;

    let mut counter = 0.0;
    for (i, number) in get_random_numbers().iter().enumerate() {
        let prev_counter = counter;
        if i % 2 == 0 {
            counter += number * random_effect.effect_a_variation as f64
                + random_effect.effect_a_min as f64;
        } else {
            counter += number * random_effect.effect_b_variation as f64
                + random_effect.effect_b_min as f64;
        }

        if effect_t < counter as u64 {
            let sub_effect_fract = (effect_t as f64 - prev_counter) / (counter - prev_counter);
            let sub_effect_t = (sub_effect_fract * u32::MAX as f64) as u64;
            if i % 2 == 0 {
                apply_effect(
                    project,
                    render_target,
                    output_target,
                    system_t,
                    &sub_effect_t,
                    &(u32::MAX as u64),
                    beat_t,
                    frame,
                    seed,
                    random_effect
                        .effect_a
                        .as_ref()
                        .unwrap()
                        .effect
                        .as_ref()
                        .unwrap(),
                    color_palette,
                );
            } else {
                apply_effect(
                    project,
                    render_target,
                    output_target,
                    system_t,
                    ms_since_start,
                    effect_duration_ms,
                    beat_t,
                    frame,
                    seed,
                    random_effect
                        .effect_b
                        .as_ref()
                        .unwrap()
                        .effect
                        .as_ref()
                        .unwrap(),
                    color_palette,
                );
            }
            return;
        }
    }
}

pub const LARGE_PRIME: u64 = 4294967291;

fn generate_random_numbers() -> (Vec<f64>, f64, f64) {
    use rand::Rng;

    let mut rng = rand::rng();
    const COUNT: usize = 16384;

    let mut random_numbers = Vec::with_capacity(COUNT);
    let mut even_sum = 0.0;
    let mut odd_sum = 0.0;

    for i in 0..COUNT {
        let real: u32 = rng.random();
        let num = (real as f32 / 4096.0).fract() as f64;

        if i % 2 == 1 {
            even_sum += num;
        } else {
            odd_sum += num;
        }

        random_numbers.push(num);
    }

    (random_numbers, even_sum, odd_sum)
}

// Lazy-initialized random numbers
static RANDOM_DATA: Lazy<(Vec<f64>, f64, f64)> = Lazy::new(|| generate_random_numbers());

fn get_random_numbers() -> &'static Vec<f64> {
    &RANDOM_DATA.0
}

fn get_even_sum() -> f64 {
    RANDOM_DATA.1
}

fn get_odd_sum() -> f64 {
    RANDOM_DATA.2
}

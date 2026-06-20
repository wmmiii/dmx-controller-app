//! Minimal wgpu initialization test for iOS compatibility verification.
//! This module can be removed after Phase 0 is complete.

/// Initialize wgpu headless and create a test texture to confirm the GPU
/// backend (Metal on Apple platforms) is available.
async fn test_wgpu_init() -> Result<String, String> {
    // Request adapter with no surface (headless rendering)
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None, // Headless - no window surface
            force_fallback_adapter: false,
        })
        .await
        .map_err(|e| format!("No GPU adapter found: {e}"))?;

    let (device, _queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default())
        .await
        .map_err(|e| format!("Device request failed: {e}"))?;

    // Create a small test texture to verify GPU memory allocation works
    let _texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("test_texture"),
        size: wgpu::Extent3d {
            width: 64,
            height: 64,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });

    let info = adapter.get_info();
    Ok(format!(
        "SUCCESS: wgpu initialized!\nAdapter: {}\nBackend: {:?}\nDriver: {}",
        info.name, info.backend, info.driver
    ))
}

#[tauri::command]
pub async fn test_shader_spike() -> Result<String, String> {
    test_wgpu_init().await
}

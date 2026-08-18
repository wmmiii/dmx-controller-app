use artnet_protocol::{ArtCommand, Output, PortAddress};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::Mutex;

const ARTNET_PORT: u16 = 6454;

pub struct ArtnetState {
    socket: Mutex<UdpSocket>,
}

impl ArtnetState {
    pub fn new() -> Result<Self, String> {
        let socket = UdpSocket::bind("0.0.0.0:0")
            .map_err(|e| format!("Failed to create Art-Net socket: {e}"))?;

        Ok(ArtnetState {
            socket: Mutex::new(socket),
        })
    }

    pub(crate) fn output_artnet(
        &self,
        universe: u16,
        ip_address: &str,
        data: &[u8],
    ) -> Result<(), String> {
        let ip_addr: IpAddr = ip_address
            .parse()
            .map_err(|e| format!("Invalid IP address '{ip_address}': {e}"))?;
        let socket_addr = SocketAddr::new(ip_addr, ARTNET_PORT);

        let port_address = PortAddress::try_from(universe)
            .map_err(|e| format!("Invalid Art-Net universe {universe}: {e}"))?;

        let command = ArtCommand::Output(Output {
            port_address,
            data: data.to_vec().into(),
            ..Output::default()
        });

        let bytes = command
            .write_to_buffer()
            .map_err(|e| format!("Failed to encode Art-Net packet: {e}"))?;

        let socket = self
            .socket
            .lock()
            .map_err(|e| format!("Failed to lock Art-Net socket: {e}"))?;

        socket
            .send_to(&bytes, socket_addr)
            .map_err(|e| format!("Failed to send Art-Net DMX data: {e}"))?;

        Ok(())
    }
}

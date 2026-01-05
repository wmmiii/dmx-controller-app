// MCP (Model Context Protocol) server for AI-powered tile creation
//
// This module provides an MCP server that allows AI assistants to create
// and modify DMX lighting tiles using natural language descriptions.

pub mod examples;
pub mod server;
pub mod tools;
pub mod types;

pub use server::{McpError, McpServer};

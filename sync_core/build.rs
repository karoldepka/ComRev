fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    std::env::set_var("PROTOC", protoc);

    let server_feature = std::env::var("CARGO_FEATURE_SERVER").is_ok();

    tonic_build::configure()
        .build_server(server_feature)
        .build_client(true)
        .build_transport(false) // no tonic::transport — using tonic-web-wasm-client instead
        .compile_protos(&["../proto/structable.proto"], &["../proto"])?;

    Ok(())
}

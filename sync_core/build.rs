fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use vendored protoc so no system install is needed
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    std::env::set_var("PROTOC", protoc);

    tonic_build::configure()
        .build_server(false) // WASM only needs the client
        .build_client(true)
        .build_transport(false) // no tonic::transport — using tonic-web-wasm-client instead
        .compile_protos(&["../proto/structable.proto"], &["../proto"])?;

    Ok(())
}

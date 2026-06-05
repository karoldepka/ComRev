/* tslint:disable */
/* eslint-disable */
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */

export type ReadableStreamType = "bytes";

export class IntoUnderlyingByteSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableByteStreamController): Promise<any>;
    start(controller: ReadableByteStreamController): void;
    readonly autoAllocateChunkSize: number;
    readonly type: ReadableStreamType;
}

export class IntoUnderlyingSink {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    abort(reason: any): Promise<any>;
    close(): Promise<any>;
    write(chunk: any): Promise<any>;
}

export class IntoUnderlyingSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableStreamDefaultController): Promise<any>;
}

export class SyncClient {
    free(): void;
    [Symbol.dispose](): void;
    add_hidden_column(column_id: string): Promise<any>;
    add_hidden_row(repo_id: number): Promise<any>;
    /**
     * Returns Promise<string> — the column id.
     */
    create_custom_column(payload_json: string): Promise<any>;
    create_row(table_id: string, row_id: string, values_json: string): Promise<any>;
    create_row_class(table_id: string, id: string, name: string, color: string): Promise<any>;
    create_table(payload_json: string): Promise<any>;
    delete_custom_column(id: string): Promise<any>;
    delete_flag(key: string): Promise<any>;
    delete_remark(id: string): Promise<any>;
    delete_row_class(table_id: string, id: string): Promise<any>;
    delete_table(id: string): Promise<any>;
    fetch_custom_columns(table_id: string): Promise<any>;
    fetch_data_rows(table_id: string, params_json: string): Promise<any>;
    fetch_flags(): Promise<any>;
    fetch_hidden_columns(): Promise<any>;
    fetch_hidden_rows(): Promise<any>;
    fetch_remarks(): Promise<any>;
    fetch_tables(): Promise<any>;
    /**
     * Returns a JSON string: `[{ "id": "…", "description": "…" }, …]`
     */
    get_queue_summary(): string;
    /**
     * Open IDB, load any persisted ops, flush them, and start reconnect listener.
     * Returns a Promise<void>.
     */
    init(): Promise<any>;
    constructor(base_url: string);
    nuke_db(): Promise<any>;
    patch_table(id: string, patch_json: string): Promise<any>;
    queue_length(): number;
    remove_hidden_column(column_id: string): Promise<any>;
    remove_hidden_row(repo_id: number): Promise<any>;
    set_column_frozen(table_id: string, column_id: string, is_frozen: boolean): Promise<any>;
    set_column_source_path(table_id: string, column_id: string, path_json: string): Promise<any>;
    set_many_to_many(table_id: string, row_id: string, field_id: string, item_ids_json: string): Promise<any>;
    set_on_error(cb: Function): void;
    set_on_queue_change(cb: Function): void;
    /**
     * Register an event callback; called with a JSON string for each ServerEvent.
     * Returns a `() => void` unsubscribe function.
     */
    subscribe(on_event: Function): Function;
    /**
     * Kick off a flush without awaiting it — safe to call from JS event handlers.
     */
    trigger_flush(): void;
    upsert_cell_value(table_id: string, row_id: string, col_id: string, value_json: string): Promise<any>;
    upsert_flag(key: string, color: string): Promise<any>;
    /**
     * Returns Promise<string> — the remark id (either the provided existing_id or a new nanoid).
     */
    upsert_remark(existing_id: any, kind: string, body: string, targets_json: string): Promise<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_syncclient_free: (a: number, b: number) => void;
    readonly syncclient_add_hidden_column: (a: number, b: number, c: number) => any;
    readonly syncclient_add_hidden_row: (a: number, b: number) => any;
    readonly syncclient_create_custom_column: (a: number, b: number, c: number) => any;
    readonly syncclient_create_row: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly syncclient_create_row_class: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly syncclient_create_table: (a: number, b: number, c: number) => any;
    readonly syncclient_delete_custom_column: (a: number, b: number, c: number) => any;
    readonly syncclient_delete_flag: (a: number, b: number, c: number) => any;
    readonly syncclient_delete_remark: (a: number, b: number, c: number) => any;
    readonly syncclient_delete_row_class: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly syncclient_delete_table: (a: number, b: number, c: number) => any;
    readonly syncclient_fetch_custom_columns: (a: number, b: number, c: number) => any;
    readonly syncclient_fetch_data_rows: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly syncclient_fetch_flags: (a: number) => any;
    readonly syncclient_fetch_hidden_columns: (a: number) => any;
    readonly syncclient_fetch_hidden_rows: (a: number) => any;
    readonly syncclient_fetch_remarks: (a: number) => any;
    readonly syncclient_fetch_tables: (a: number) => any;
    readonly syncclient_get_queue_summary: (a: number) => [number, number];
    readonly syncclient_init: (a: number) => any;
    readonly syncclient_new: (a: number, b: number) => number;
    readonly syncclient_nuke_db: (a: number) => any;
    readonly syncclient_patch_table: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly syncclient_queue_length: (a: number) => number;
    readonly syncclient_remove_hidden_column: (a: number, b: number, c: number) => any;
    readonly syncclient_remove_hidden_row: (a: number, b: number) => any;
    readonly syncclient_set_column_frozen: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly syncclient_set_column_source_path: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly syncclient_set_many_to_many: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly syncclient_set_on_error: (a: number, b: any) => void;
    readonly syncclient_set_on_queue_change: (a: number, b: any) => void;
    readonly syncclient_subscribe: (a: number, b: any) => any;
    readonly syncclient_trigger_flush: (a: number) => void;
    readonly syncclient_upsert_cell_value: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly syncclient_upsert_flag: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly syncclient_upsert_remark: (a: number, b: any, c: number, d: number, e: number, f: number, g: number, h: number) => any;
    readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
    readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
    readonly intounderlyingbytesource_cancel: (a: number) => void;
    readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
    readonly intounderlyingbytesource_start: (a: number, b: any) => void;
    readonly intounderlyingbytesource_type: (a: number) => number;
    readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
    readonly intounderlyingsource_cancel: (a: number) => void;
    readonly intounderlyingsource_pull: (a: number, b: any) => any;
    readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
    readonly intounderlyingsink_abort: (a: number, b: any) => any;
    readonly intounderlyingsink_close: (a: number) => any;
    readonly intounderlyingsink_write: (a: number, b: any) => any;
    readonly wasm_bindgen__convert__closures_____invoke__hbeecec0f4f776524: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h0531559c0ca93e11: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h65417e83baa3ea96: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5a03c05b96769fc5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hba3b1fd881966764: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h1d8ad3d6f57141da: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

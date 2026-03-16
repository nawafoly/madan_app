import FileFsRef from './file-fs-ref';
/**
 * Check if a Python file is a valid entrypoint by detecting:
 * - A top-level 'app' callable (Flask, FastAPI, Sanic, WSGI/ASGI, etc.)
 * - A top-level 'application' callable (Django)
 * - A top-level 'handler' class (BaseHTTPRequestHandler subclass)
 */
export declare function isPythonEntrypoint(file: FileFsRef | {
    fsPath?: string;
}): Promise<boolean>;
/**
 * For Django projects: read manage.py if present and return the value set for
 * DJANGO_SETTINGS_MODULE (e.g. from os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')).
 * Returns null if manage.py is missing or the pattern is not found.
 */
export declare function getDjangoSettingsModule(workPath: string): Promise<string | null>;
/**
 * For Django projects: resolve the ASGI or WSGI application entrypoint by reading
 * DJANGO_SETTINGS_MODULE from manage.py, loading that settings file, and
 * returning the file path for ASGI_APPLICATION or WSGI_APPLICATION (e.g.
 * 'myapp.asgi.application' -> 'myapp/asgi.py'). Returns null if any step fails.
 */
export declare function getDjangoEntrypoint(workPath: string): Promise<string | null>;

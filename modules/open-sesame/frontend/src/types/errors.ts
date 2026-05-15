export interface AppError {
    kind:
    | 'database'
    | 'git'
    | 'io'
    | 'network'
    | 'auth'
    | 'sync'
    | 'provider'
    | 'not_found'
    | 'validation'
    | 'internal';
    message: string;
}

export function isAppError(error: unknown): error is AppError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'kind' in error &&
        'message' in error
    );
}

import type { FileNode } from './source-mapping-types';

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(message)), ms);
        promise
            .then((value) => {
                window.clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                window.clearTimeout(timer);
                reject(err);
            });
    });
}

export function collectNodes(node: FileNode): FileNode[] {
    return [node, ...(node.children || []).flatMap(collectNodes)];
}

export function findNode(node: FileNode, path: string): FileNode | null {
    if ((node.path || '.') === path) return node;
    for (const child of node.children || []) {
        const found = findNode(child, path);
        if (found) return found;
    }
    return null;
}

export function countChildren(node: FileNode) {
    const nodes = collectNodes(node).slice(1);
    return {
        folders: nodes.filter((child) => child.is_dir).length,
        files: nodes.filter((child) => !child.is_dir).length,
    };
}

export function relativeMirrorPath(basePath: string, childPath: string) {
    if (basePath === '.' || basePath === '') return childPath === '.' ? '' : childPath;
    if (childPath === basePath) return '';
    return childPath.startsWith(`${basePath}/`) ? childPath.slice(basePath.length + 1) : childPath;
}

export function joinLocalPath(basePath: string, mirrorPath: string) {
    if (mirrorPath === '.' || !mirrorPath) return basePath;
    const separator = basePath.includes('\\') ? '\\' : '/';
    const cleanBase = basePath.replace(/[\\/]+$/, '');
    const cleanMirror = mirrorPath.replace(/^[\\/]+/, '').replace(/[\\/]+/g, separator);
    return `${cleanBase}${separator}${cleanMirror}`;
}

export function getEffectiveMappedPath(mappedPaths: Map<string, string>, mirrorPath: string) {
    const normalized = mirrorPath || '.';
    const direct = mappedPaths.get(normalized);
    if (direct) return direct;

    const parts = normalized === '.' ? [] : normalized.split('/');
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const parentPath = index === 0 ? '.' : parts.slice(0, index).join('/');
        const parentLocalPath = mappedPaths.get(parentPath);
        if (parentLocalPath) {
            return joinLocalPath(parentLocalPath, parts.slice(index).join('/'));
        }
    }

    return undefined;
}

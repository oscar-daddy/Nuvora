/**
 * MoveFileModal - modal for selecting a destination folder
 */
import { useState, useEffect, useRef } from 'react';
import { X, Folder as FolderIcon, ChevronRight, Home } from 'lucide-react';
import { useFolderTree, TelegramFile, Folder, useMoveFiles, useMoveFolders } from '../lib/api';
import { useAppStore } from '../lib/store';
import { useFocusReturn } from '../lib/useFocusReturn';

interface MoveFileModalProps {
    items: { files: TelegramFile[]; folders: Folder[] };
    onClose: () => void;
}

export default function MoveFileModal({ items, onClose }: MoveFileModalProps) {
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const { data: folderTree, isLoading } = useFolderTree();
    const { mutateAsync: moveFiles, isPending: isFilesPending } = useMoveFiles();
    const { mutateAsync: moveFolders, isPending: isFoldersPending } = useMoveFolders();
    const addToast = useAppStore((s) => s.addToast);
const clearSelection = useAppStore((s) => s.clearSelection);
    // Return focus to the opener (Move menu item) on close.
    useFocusReturn();

    const isPending = isFilesPending || isFoldersPending;
    const totalItems = items.files.length + items.folders.length;

    // Guarded close while a move POST is in flight + own Escape listener so
    // FileBrowser's unguarded global handler can't bypass the guard.
    const pendingRef = useRef(isPending);
    pendingRef.current = isPending;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const safeClose = () => { if (!pendingRef.current) onCloseRef.current(); };
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                safeClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const handleMove = async () => {
        try {
            if (items.folders.length > 0) {
                // Prevent moving a folder into itself or any of its descendants.
                // Validate before any mutation is dispatched.
                const folderIds = new Set(items.folders.map(f => f.id));
                const descendants = new Set<number>();
                const collectSubtree = (nodes: Folder[] | undefined) => {
                    nodes?.forEach(n => {
                        descendants.add(n.id);
                        collectSubtree(n.children);
                    });
                };
                // Descend the tree; anything under a moved folder (not itself
                // another moved folder) is an invalid destination.
                const findMoved = (nodes: Folder[] | undefined) => {
                    nodes?.forEach(n => {
                        if (folderIds.has(n.id)) {
                            collectSubtree(n.children);
                        } else {
                            findMoved(n.children);
                        }
                    });
                };
                findMoved(folderTree);
                if (selectedId != null && (folderIds.has(selectedId) || descendants.has(selectedId))) {
                    addToast('无法将文件夹移动到自身或其子文件夹中', 'error');
                    return;
                }
            }

            const promises = [];
            if (items.files.length > 0) {
                promises.push(moveFiles({ ids: items.files.map(f => f.id), folderId: selectedId }));
            }
            if (items.folders.length > 0) {
                promises.push(moveFolders({ ids: items.folders.map(f => f.id), folderId: selectedId }));
            }

            await Promise.all(promises);
            addToast(`已成功移动 ${totalItems} 个项目`);
            clearSelection();
            onClose();
        } catch (error) {
            addToast('移动项目失败', 'error');
        }
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) safeClose(); }}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); safeClose(); } }}
            tabIndex={-1}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="glass-card w-full max-w-md p-6 animate-scale-in">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">移动 {totalItems} 个项目</h2>
                    <button onClick={safeClose} className="p-1 hover:bg-dark-700 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-dark-400 mb-4 truncate">
                    请选择目标文件夹
                </p>

                <div className="bg-dark-800 rounded-lg max-h-64 overflow-y-auto mb-4">
                    {/* Root option */}
                    <button
                        onClick={() => setSelectedId(null)}
                        className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-dark-700 transition-colors ${selectedId === null ? 'bg-primary-600/20 text-primary-400' : ''
                            }`}
                    >
                        <Home className="w-4 h-4" />
                        <span>根目录（不属于任何文件夹）</span>
                    </button>

                    {isLoading ? (
                        <div className="p-4 text-center text-dark-400">正在加载...</div>
                    ) : (
                        folderTree?.map((folder) => (
                            <FolderTreeItem
                                key={folder.id}
                                folder={folder}
                                selectedId={selectedId}
                                onSelect={setSelectedId}
                                depth={0}
                            />
                        ))
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={safeClose}
                        className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleMove}
                        disabled={isPending}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isPending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                正在移动...
                            </>
                        ) : (
                            '移动到此处'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function FolderTreeItem({ folder, selectedId, onSelect, depth }: {
    folder: Folder;
    selectedId: number | null;
    onSelect: (id: number) => void;
    depth: number;
}) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = folder.children && folder.children.length > 0;

    return (
        <div>
            {/* Row is a plain div with two sibling buttons: an interactive
                toggle nested inside the select <button> is invalid HTML and
                unreachable by keyboard, so expand and select are peers. */}
            <div
                className={`w-full flex items-center gap-2 px-4 py-2 hover:bg-dark-700 transition-colors ${selectedId === folder.id ? 'bg-primary-600/20 text-primary-400' : ''
                    }`}
                style={{ paddingLeft: `${16 + depth * 16}px` }}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        aria-expanded={expanded}
                        aria-label={expanded ? `收起文件夹 ${folder.name}` : `展开文件夹 ${folder.name}`}
                        className="p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                    >
                        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                ) : (
                    <div className="w-4 shrink-0" aria-hidden="true" />
                )}
                <button
                    type="button"
                    onClick={() => onSelect(folder.id)}
                    aria-pressed={selectedId === folder.id}
                    aria-label={`选择文件夹 ${folder.name}`}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                    <FolderIcon className="w-4 h-4 text-primary-400 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                    <span className="text-xs text-dark-500 ml-auto shrink-0">{folder.file_count}</span>
                </button>
            </div>

            {expanded && hasChildren && folder.children?.map((child) => (
                <FolderTreeItem
                    key={child.id}
                    folder={child}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    depth={depth + 1}
                />
            ))}
        </div>
    );
}

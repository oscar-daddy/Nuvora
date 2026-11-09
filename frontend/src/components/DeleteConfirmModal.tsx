/**
 * 删除ConfirmModal - confirmation dialog for deleting files/folders
 */
import { useState, useRef, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useFocusReturn } from '../lib/useFocusReturn';

interface DeleteConfirmModalProps {
    type: 'file' | 'folder' | 'multiple';
    name?: string;
    count?: number;
    onConfirm: () => void | Promise<void>;
    onClose: () => void;
}

export default function DeleteConfirmModal({ type, name, count = 1, onConfirm, onClose }: DeleteConfirmModalProps) {
    const [isPending, setIsPending] = useState(false);
    const inFlightRef = useRef(false);
    // Return focus to the opener (删除 menu item) on close. Safe when the
    // deleted item's card is already gone — focus() on it just no-ops.
    useFocusReturn();

    // Guarded close while the delete POST is in flight (same rationale as
    // RenameModal's safeClose). Own Escape listener so FileBrowser's
    // unguarded global handler can't bypass the guard.
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

    const handleConfirm = async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setIsPending(true);
        try {
            await onConfirm();
        } finally {
            inFlightRef.current = false;
            setIsPending(false);
        }
    };
    const title = count > 1 ? `删除 ${count} 个项目` : `删除${type === 'file' ? '文件' : type === 'folder' ? '文件夹' : '项目'}`;
    const message = count > 1 
        ? `确定要删除这 ${count} 个项目吗？`
        : <>确定要删除 <span className="text-white font-medium">"{name}"</span>吗？</>;

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) safeClose(); }}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); safeClose(); } }}
            tabIndex={-1}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="glass-card w-full max-w-sm p-6 animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-red-400">
                        <Trash2 className="w-5 h-5" />
                        {title}
                    </h2>
                    <button onClick={safeClose} className="p-1 hover:bg-dark-700 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="text-dark-300 mb-6">
                    <p>{message}</p>
                    <p className="mt-2 text-sm text-red-400">
                        此操作无法撤销。
                    </p>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={safeClose}
                        className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isPending}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? '正在删除...' : '删除'}
                    </button>
                </div>
            </div>
        </div>
    );
}

using System;
using System.Runtime.InteropServices;

public static class ExplorerShell {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern IShellItem SHCreateItemFromParsingName(string path, IntPtr binding, [MarshalAs(UnmanagedType.LPStruct)] Guid iid);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string source, string destination, uint flags);

    [DllImport("user32.dll")]
    public static extern uint GetClipboardSequenceNumber();

    [DllImport("user32.dll")]
    private static extern bool OpenClipboard(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool CloseClipboard();

    [DllImport("user32.dll")]
    private static extern bool EmptyClipboard();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint RegisterClipboardFormat(string format);

    [DllImport("user32.dll")]
    private static extern IntPtr GetClipboardData(uint format);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GlobalLock(IntPtr memory);

    [DllImport("kernel32.dll")]
    private static extern bool GlobalUnlock(IntPtr memory);

    [DllImport("kernel32.dll")]
    private static extern UIntPtr GlobalSize(IntPtr memory);

    public static bool ClipboardIsCut() {
        if (!OpenClipboard(IntPtr.Zero)) throw new InvalidOperationException("Clipboard unavailable");
        try {
            IntPtr memory = GetClipboardData(RegisterClipboardFormat("Preferred DropEffect"));
            if (memory == IntPtr.Zero || GlobalSize(memory).ToUInt64() < 4) return false;
            IntPtr data = GlobalLock(memory);
            if (data == IntPtr.Zero) return false;
            try { return (Marshal.ReadInt32(data) & 2) != 0; }
            finally { GlobalUnlock(memory); }
        } finally { CloseClipboard(); }
    }

    public static int Rename(string source, string destination) {
        return MoveFileEx(source, destination, 0) ? 0 : Marshal.GetLastWin32Error();
    }

    public static void ClearClipboardIfUnchanged(uint sequence) {
        if (!OpenClipboard(IntPtr.Zero)) return;
        try {
            if (sequence == GetClipboardSequenceNumber()) EmptyClipboard();
        } finally { CloseClipboard(); }
    }

    public static bool Transfer(string source, string destination, bool cut) {
        IFileOperation operation = (IFileOperation)new FileOperation();
        try {
            const uint silent = 0x4, keepBoth = 0x8, noConfirmation = 0x10;
            const uint noErrorUI = 0x400, onlySelected = 0x2000, earlyFailure = 0x100000;
            const uint keepExtension = 0x200000, noCopyHooks = 0x800000, undoRecord = 0x20000000;
            operation.SetOperationFlags(silent | keepBoth | noConfirmation | noErrorUI | onlySelected
                | earlyFailure | keepExtension | noCopyHooks | undoRecord);
            Guid iid = typeof(IShellItem).GUID;
            IShellItem item = SHCreateItemFromParsingName(source, IntPtr.Zero, iid);
            try {
                IShellItem folder = SHCreateItemFromParsingName(destination, IntPtr.Zero, iid);
                try {
                    if (cut) operation.MoveItem(item, folder, null, IntPtr.Zero);
                    else operation.CopyItem(item, folder, null, IntPtr.Zero);
                    operation.PerformOperations();
                    return !operation.GetAnyOperationsAborted();
                } finally { Marshal.ReleaseComObject(folder); }
            } finally { Marshal.ReleaseComObject(item); }
        } finally { Marshal.ReleaseComObject(operation); }
    }

    public static bool Recycle(string source) {
        IFileOperation operation = (IFileOperation)new FileOperation();
        try {
            const uint silent = 0x4, noConfirmation = 0x10, allowUndo = 0x40, noErrorUI = 0x400;
            const uint onlySelected = 0x2000, warnPermanent = 0x4000, recycle = 0x80000;
            const uint earlyFailure = 0x100000, noCopyHooks = 0x800000, undoRecord = 0x20000000;
            operation.SetOperationFlags(silent | noConfirmation | allowUndo | noErrorUI | onlySelected | warnPermanent
                | recycle | earlyFailure | noCopyHooks | undoRecord);
            IShellItem item = SHCreateItemFromParsingName(source, IntPtr.Zero, typeof(IShellItem).GUID);
            try {
                RecycleOnly sink = new RecycleOnly();
                operation.DeleteItem(item, sink);
                operation.PerformOperations();
                return sink.Recycled && !operation.GetAnyOperationsAborted();
            } finally { Marshal.ReleaseComObject(item); }
        } finally { Marshal.ReleaseComObject(operation); }
    }

    [ComImport, Guid("3AD05575-8857-4850-9277-11B85BDB8E09")]
    private class FileOperation { }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem { }

    // Keep the declaration in the native IFileOperation vtable order.
    [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOperation {
        void Advise(IntPtr sink, out uint cookie);
        void Unadvise(uint cookie);
        void SetOperationFlags(uint flags);
        void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
        void SetProgressDialog(IntPtr dialog);
        void SetProperties(IntPtr properties);
        void SetOwnerWindow(IntPtr window);
        void ApplyPropertiesToItem(IShellItem item);
        void ApplyPropertiesToItems(IntPtr items);
        void RenameItem(IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
        void MoveItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void MoveItems(IntPtr items, IShellItem destination);
        void CopyItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void CopyItems(IntPtr items, IShellItem destination);
        void DeleteItem(IShellItem item, IFileOperationProgressSink sink);
        void DeleteItems(IntPtr items);
        void NewItem(IShellItem destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name,
            [MarshalAs(UnmanagedType.LPWStr)] string template, IntPtr sink);
        void PerformOperations();
        [return: MarshalAs(UnmanagedType.Bool)]
        bool GetAnyOperationsAborted();
    }

    [ComImport, Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileOperationProgressSink {
        [PreserveSig] int StartOperations();
        [PreserveSig] int FinishOperations(int result);
        [PreserveSig] int PreRenameItem(uint flags, IShellItem item, IntPtr name);
        [PreserveSig] int PostRenameItem(uint flags, IShellItem item, IntPtr name, int result, IShellItem created);
        [PreserveSig] int PreMoveItem(uint flags, IShellItem item, IShellItem folder, IntPtr name);
        [PreserveSig] int PostMoveItem(uint flags, IShellItem item, IShellItem folder, IntPtr name, int result, IShellItem created);
        [PreserveSig] int PreCopyItem(uint flags, IShellItem item, IShellItem folder, IntPtr name);
        [PreserveSig] int PostCopyItem(uint flags, IShellItem item, IShellItem folder, IntPtr name, int result, IShellItem created);
        [PreserveSig] int PreDeleteItem(uint flags, IShellItem item);
        [PreserveSig] int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created);
        [PreserveSig] int PreNewItem(uint flags, IShellItem folder, IntPtr name);
        [PreserveSig] int PostNewItem(uint flags, IShellItem folder, IntPtr name, IntPtr template, uint attrs, int result, IShellItem created);
        [PreserveSig] int UpdateProgress(uint total, uint completed);
        [PreserveSig] int ResetTimer();
        [PreserveSig] int PauseTimer();
        [PreserveSig] int ResumeTimer();
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class RecycleOnly : IFileOperationProgressSink {
        public bool Recycled { get; private set; }

        public int PreDeleteItem(uint flags, IShellItem item) {
            const uint recycleIfPossible = 0x80;
            const int cancelled = unchecked((int)0x800704C7);
            return (flags & recycleIfPossible) != 0 ? 0 : cancelled;
        }

        public int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created) {
            Recycled = result >= 0 && created != null;
            return 0;
        }

        public int StartOperations() { return 0; }
        public int FinishOperations(int result) { return 0; }
        public int PreRenameItem(uint flags, IShellItem item, IntPtr name) { return 0; }
        public int PostRenameItem(uint flags, IShellItem item, IntPtr name, int result, IShellItem created) { return 0; }
        public int PreMoveItem(uint flags, IShellItem item, IShellItem folder, IntPtr name) { return 0; }
        public int PostMoveItem(uint flags, IShellItem item, IShellItem folder, IntPtr name, int result, IShellItem created) { return 0; }
        public int PreCopyItem(uint flags, IShellItem item, IShellItem folder, IntPtr name) { return 0; }
        public int PostCopyItem(uint flags, IShellItem item, IShellItem folder, IntPtr name, int result, IShellItem created) { return 0; }
        public int PreNewItem(uint flags, IShellItem folder, IntPtr name) { return 0; }
        public int PostNewItem(uint flags, IShellItem folder, IntPtr name, IntPtr template, uint attrs, int result, IShellItem created) { return 0; }
        public int UpdateProgress(uint total, uint completed) { return 0; }
        public int ResetTimer() { return 0; }
        public int PauseTimer() { return 0; }
        public int ResumeTimer() { return 0; }
    }
}

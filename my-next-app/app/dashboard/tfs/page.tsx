"use client";

export default function TFSRecordsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20">
        <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-white">TFS Records</h2>
        <p className="text-sm text-gray-500 mt-1">Coming soon — TFS data will appear here.</p>
      </div>
    </div>
  );
}

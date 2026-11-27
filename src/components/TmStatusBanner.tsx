import { retryTmClub } from '@/app/admin/actions';
import { formatTime } from '@/lib/format';
import { getSetting } from '@/lib/settings';

/** Red bar on every admin page while tmclub.eu needs a person (human check or blocked). */
export function TmStatusBanner() {
  const state = getSetting('tm_state');
  if (state !== 'needs-human' && state !== 'blocked') return null;
  const url = getSetting('tm_verify_url');
  const expires = getSetting('tm_verify_expires');
  const retryRequested = getSetting('tm_reset_requested') === '1';
  return (
    <div className="bg-stop text-white print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-6">
        {state === 'needs-human' && url ? (
          <p className="flex-1">
            <strong>tmclub.eu needs a human check.</strong> Open{' '}
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">the verification page</a> and tick “Verify you are human”
            {expires ? ` before ${formatTime(new Date(expires))}` : ''}. Role sign-ups are queued meanwhile.
          </p>
        ) : (
          <>
            <p className="flex-1">
              <strong>tmclub.eu sync is paused:</strong> {(getSetting('tm_state_reason') ?? 'unknown error').replace(/\.$/, '')}. Role sign-ups are queued and will be written once it works again.
            </p>
            <form action={retryTmClub}>
              <button className="rounded-full bg-white px-4 py-1.5 font-semibold text-stop" disabled={retryRequested}>
                {retryRequested ? 'Retrying…' : 'Retry now'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

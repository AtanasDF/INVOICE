// What a customer sees when the link in their email no longer works. It
// says nothing about whether the link ever existed -- someone guessing
// tokens learns the same as someone whose link was stopped.
export default function RequestLinkNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h1 className="text-2xl font-bold">This link isn&apos;t working</h1>
        <p className="mt-2 text-neutral-600">
          It may have been replaced by a newer one, or the sender may have stopped it.
        </p>
        <p className="mt-3 text-neutral-600">
          Ask whoever asked you for prices to send the link again. Nothing has gone wrong at your end.
        </p>
      </div>
    </div>
  );
}

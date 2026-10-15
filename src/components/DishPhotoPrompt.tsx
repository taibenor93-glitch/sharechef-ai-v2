import { useRef, useState } from 'react'
import { saveDishPhoto } from '../lib/dishPhoto'

type Props = {
  userId: string
  recipeId: string
  onSaved: (path: string) => void
  onSkip?: () => void
  // Shown when the recipe already has a photo (replace instead of add).
  replace?: boolean
}

// "Snap your dish" step after a cook. Always optional.
export function DishPhotoPrompt({ userId, recipeId, onSaved, onSkip, replace }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same photo be picked again after an error
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveDishPhoto(userId, recipeId, file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the photo. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="photo-prompt stack">
      {!replace && (
        <div>
          <div className="section-title">📸 Snap your dish?</div>
          <div className="muted" style={{ fontSize: 14 }}>
            Add a photo and it saves with this recipe. Your shares show it too.
          </div>
        </div>
      )}
      {/* No `capture` attribute: iOS then offers both Take Photo and Photo Library. */}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={replace ? 'btn btn-ghost' : 'btn btn-primary'}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Saving photo…' : replace ? 'Change photo' : 'Take a photo'}
        </button>
        {onSkip && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}

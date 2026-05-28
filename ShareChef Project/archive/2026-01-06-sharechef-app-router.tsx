import { useEffect, useMemo, useState } from "react"
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom"

type RecipeDraft = {
  title: string
  ingredients: string[]
  steps: string[]
  rawText: string
}

type SavedRecipe = RecipeDraft & {
  id: string
  createdAt: number
}

type SortMode = "newest" | "oldest" | "title"

const pageStyle = {
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
} as const

function capitalize(s: string) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function Home(props: { savedCount: number; onSave: (draft: RecipeDraft) => void }) {
  const { savedCount, onSave } = props
  const navigate = useNavigate()

  const [input, setInput] = useState("")
  const [response, setResponse] = useState("")
  const [isSaved, setIsSaved] = useState(false)
  const [currentDraft, setCurrentDraft] = useState<RecipeDraft | null>(null)

  function generateRecipe() {
    const normalized = input.trim()
    if (!normalized) return

    const ingredients = normalized
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const title = ingredients[0]
      ? `${capitalize(ingredients[0])} Quick Recipe`
      : "Quick Recipe"

    const steps = [
      `Prep: get ${ingredients.slice(0, 3).join(", ") || "your ingredients"} ready.`,
      "Cook: heat a pan, add a little oil, and cook your main ingredient until done.",
      "Finish: combine, season to taste, and serve.",
    ]

    const rawText = `🍽️ SHARECHEF RECIPE

Title:
${title}

Ingredients:
${ingredients.map((i) => `- ${i}`).join("\n")}

Steps:
${steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}
`

    const draft: RecipeDraft = { title, ingredients, steps, rawText }
    setCurrentDraft(draft)
    setResponse(rawText)
    setIsSaved(false)
  }

  function handleSave() {
    if (!currentDraft) return
    onSave(currentDraft)
    setIsSaved(true)
  }

  return (
    <div style={pageStyle}>
      <h1>ShareChef Chat</h1>

      <div style={{ marginBottom: 12 }}>
        <Link to="/saved">Go to Saved Recipes</Link>
        <span style={{ marginLeft: 10 }}>({savedCount} saved)</span>
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="e.g. chicken, rice, broccoli"
        style={{ width: 320, padding: 8 }}
      />

      <div style={{ marginTop: 10 }}>
        <button onClick={generateRecipe}>Generate Recipe</button>
      </div>

      {response && (
        <div style={{ marginTop: 16 }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{response}</pre>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={handleSave} disabled={isSaved}>
              {isSaved ? "Saved" : "Save to My Recipes"}
            </button>

            <button onClick={() => navigate("/saved")} disabled={savedCount === 0}>
              View Saved
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SavedList(props: { saved: SavedRecipe[]; onRemove: (id: string) => void }) {
  const { saved, onRemove } = props

  const [query, setQuery] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("newest")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()

    let list = [...saved]
    if (q) {
      list = list.filter((r) => {
        const hay = `${r.title} ${r.ingredients.join(" ")}`.toLowerCase()
        return hay.includes(q)
      })
    }

    list.sort((a, b) => {
      if (sortMode === "newest") return b.createdAt - a.createdAt
      if (sortMode === "oldest") return a.createdAt - b.createdAt
      return a.title.localeCompare(b.title)
    })

    return list
  }, [saved, query, sortMode])

  return (
    <div style={pageStyle}>
      <h1>Saved Recipes</h1>

      <div style={{ marginTop: 10 }}>
        <Link to="/">Back to Chat</Link>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or ingredients…"
          style={{ width: 260, padding: 8 }}
        />

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{ padding: 8 }}
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="title">Sort: Title (A–Z)</option>
        </select>

        <div style={{ alignSelf: "center", fontSize: 13 }}>
          Showing {visible.length} of {saved.length}
        </div>
      </div>

      {saved.length === 0 ? (
        <p style={{ marginTop: 12 }}>No saved recipes yet. Go back and save one.</p>
      ) : visible.length === 0 ? (
        <p style={{ marginTop: 12 }}>No matches. Try a different search.</p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          {visible.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Link to={`/saved/${r.id}`} style={{ fontWeight: 700 }}>
                  {r.title}
                </Link>
                <button onClick={() => onRemove(r.id)}>Remove</button>
              </div>

              <div style={{ marginTop: 6, fontSize: 13 }}>
                Ingredients: {r.ingredients.length} • Saved:{" "}
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SavedDetail(props: { saved: SavedRecipe[]; onRemove: (id: string) => void }) {
  const { saved, onRemove } = props
  const { id = "" } = useParams()

  const recipe = saved.find((r) => r.id === id)

  if (!recipe) {
    return (
      <div style={pageStyle}>
        <h1>Recipe Not Found</h1>
        <p>This saved recipe does not exist (it may have been removed).</p>
        <Link to="/saved">Back to Saved Recipes</Link>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1>{recipe.title}</h1>

      <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
        <Link to="/saved">Back to Saved Recipes</Link>
        <button onClick={() => onRemove(recipe.id)}>Remove</button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        Saved: {new Date(recipe.createdAt).toLocaleString()} • Ingredients:{" "}
        {recipe.ingredients.length}
      </div>

      <pre style={{ whiteSpace: "pre-wrap", marginTop: 14 }}>{recipe.rawText}</pre>
    </div>
  )
}

export default function App() {
  const STORAGE_KEY = "sharechef_saved_recipes_v1"

  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as SavedRecipe[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRecipes))
    } catch {
      // ignore storage issues for MVP
    }
  }, [savedRecipes])

  function addSavedRecipe(draft: RecipeDraft) {
    setSavedRecipes((prev) => {
      const exists = prev.some((r) => r.rawText === draft.rawText)
      if (exists) return prev
      const next: SavedRecipe = {
        id: makeId(),
        createdAt: Date.now(),
        ...draft,
      }
      return [next, ...prev]
    })
  }

  function removeSavedRecipe(id: string) {
    setSavedRecipes((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<Home savedCount={savedRecipes.length} onSave={addSavedRecipe} />}
      />
      <Route
        path="/saved"
        element={<SavedList saved={savedRecipes} onRemove={removeSavedRecipe} />}
      />
      <Route
        path="/saved/:id"
        element={<SavedDetail saved={savedRecipes} onRemove={removeSavedRecipe} />}
      />
    </Routes>
  )
}

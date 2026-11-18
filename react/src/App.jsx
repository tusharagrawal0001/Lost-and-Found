import { useEffect, useRef, useState } from "react";

const MAX_FILES = 6;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(data?.error || data || "Request failed");
  return data;
}

function escapeUrl(value) {
  return encodeURI(String(value || ""));
}

function imageSource(item, field = "image") {
  return imageSources(item, field)[0] || "";
}

function imageSources(item, field = "image") {
  return Array.isArray(item?.[field])
    ? item[field].filter(image => typeof image === "string").map(image => `data:image/jpeg;base64,${image}`)
    : [];
}

function formatDate(value) {
  if (!value) return "Recently reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently reported"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ItemCard({ item, confidence, onOpen }) {
  const source = imageSource(item);
  const photoCount = imageSources(item).length;
  return (
    <article className="item-card">
      <button type="button" onClick={() => onOpen(item, confidence)} aria-label={`View details for ${item.name || "found item"}`}>
        {source ? <img src={source} alt={item.name || "Found item"} /> : <div className="image-placeholder">No photo available</div>}
        <div className="item-body">
          {confidence != null && <span className="match-chip">{Math.round(confidence * 100)}% image similarity</span>}
          <h3>{item.name || "Unnamed item"}</h3>
          <p>{item.description || "No description provided."}</p>
          <div className="card-meta"><span>Found report · {photoCount} photo{photoCount === 1 ? "" : "s"}</span><span>{formatDate(item.createdAt)}</span></div>
        </div>
      </button>
    </article>
  );
}

function FilePicker({ id, name, title, files, previewUrls, onFiles, onRemove }) {
  const [dragging, setDragging] = useState(false);

  function validate(files) {
    const selected = [...files];
    if (selected.length > MAX_FILES) return { error: `Choose no more than ${MAX_FILES} images.` };
    if (selected.some(file => !ALLOWED_TYPES.has(file.type))) {
      return { error: "Use JPEG, PNG, or WebP images only." };
    }
    if (selected.some(file => file.size > MAX_FILE_SIZE)) {
      return { error: "Each image must be smaller than 10 MB." };
    }
    return { files: selected };
  }

  function choose(newFiles) {
    const result = validate([...files, ...newFiles]);
    if (result.error) {
      window.dispatchEvent(new CustomEvent("foundly-toast", { detail: { message: result.error, error: true } }));
      return;
    }
    onFiles(result.files);
  }

  return (
    <div
      className={`file-drop${dragging ? " dragging" : ""}`}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files); }}
    >
      <input
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={event => {
          choose(event.target.files);
          event.target.value = "";
        }}
      />
      <label className="upload-label" htmlFor={id}>
        <span className="upload-icon">+</span>
        <strong>{title}</strong>
        <small>JPEG, PNG, or WebP · add up to 6 images · 10 MB each</small>
      </label>
      {!!previewUrls.length && (
        <div className="preview-row">
          {previewUrls.map((url, index) => (
            <div className="preview-item" key={url}>
              <img src={url} alt={`Preview ${index + 1}`} />
              <button type="button" onClick={() => onRemove(index)} aria-label={`Remove image ${index + 1}`}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("browse");
  const [items, setItems] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState({ message: "", error: false, visible: false });
  const toastTimer = useRef(null);
  const dialogRef = useRef(null);
  const [dialogItem, setDialogItem] = useState(null);
  const [dialogConfidence, setDialogConfidence] = useState(null);
  const [foundFiles, setFoundFiles] = useState([]);
  const [lostFiles, setLostFiles] = useState([]);
  const [foundPreviews, setFoundPreviews] = useState([]);
  const [lostPreviews, setLostPreviews] = useState([]);
  const [matchMessage, setMatchMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function notify(message, error = false) {
    window.clearTimeout(toastTimer.current);
    setToast({ message, error, visible: true });
    toastTimer.current = window.setTimeout(() => setToast(state => ({ ...state, visible: false })), 4000);
  }

  useEffect(() => {
    function handleToast(event) { notify(event.detail.message, event.detail.error); }
    window.addEventListener("foundly-toast", handleToast);
    return () => window.removeEventListener("foundly-toast", handleToast);
  }, []);

  async function loadItems(reset = true, requestedPage = 0) {
    const nextPage = reset ? 0 : requestedPage;
    if (reset) {
      setItems([]);
      setSearchMode(false);
      setLoading(true);
    }
    try {
      const result = await api(`/lost/report/get/all/data?page=${nextPage}&size=12`);
      const content = result.content || [];
      setItems(current => reset ? content : [...current, ...content]);
      setPage(nextPage);
      setHasMore(!result.last && nextPage < (result.totalPages || 1) - 1);
      setBackendOnline(true);
    } catch (error) {
      setBackendOnline(false);
      notify(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(true); }, []);

  async function descriptionSearch(event) {
    event.preventDefault();
    const description = search.trim();
    if (!description) return loadItems(true);
    setLoading(true);
    try {
      const result = await api(`/api/matching/find?description=${encodeURIComponent(description)}`);
      if (!Array.isArray(result)) throw new Error("The search service returned an unexpected response.");
      setSearchMode(true);
      setItems(result.map(match => ({
        ...match.item,
        confidence: Number(match.percentage ?? match.Percentage) / 100
      })));
      setHasMore(false);
      setBackendOnline(true);
      notify(`${result.length} description match${result.length === 1 ? "" : "es"} found`);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  function visibleItems() {
    let result = items.filter(item => {
      if (!keyword.trim()) return true;
      const text = `${item.name || ""} ${item.description || ""}`.toLowerCase();
      return text.includes(keyword.trim().toLowerCase());
    });
    if (sort === "newest") result = [...result].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (sort === "oldest") result = [...result].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    if (sort === "name") result = [...result].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return result;
  }

  function openDialog(item, confidence = null) {
    setDialogItem(item);
    setDialogConfidence(confidence);
    dialogRef.current?.showModal();
  }

  async function submitFound(event) {
    event.preventDefault();
    if (!foundFiles.length) return notify("Add at least one photo.", true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const item = {
      name: String(form.get("name")).trim(),
      description: String(form.get("description")).trim(),
      phoneNumber: String(form.get("phoneNumber") || "").trim()
      ? `+91${String(form.get("phoneNumber")).trim()}`
      : ""
    };
    const data = new FormData();
    data.append("item", JSON.stringify(item));
    foundFiles.forEach(file => data.append("images", file));
    setSubmitting(true);
    try {
      const result = await api("/lost/report/upload", { method: "POST", body: data });
      notify(result);
      formElement.reset();
      foundPreviews.forEach(url => URL.revokeObjectURL(url));
      setFoundFiles([]);
      setFoundPreviews([]);
      await loadItems(true);
      setView("browse");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLost(event) {
    event.preventDefault();
    if (!lostFiles.length) return notify("Add at least one photo.", true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const item = {
      user_name: String(form.get("name")).trim(),
      user_description: String(form.get("description")).trim(),
      user_phoneNUmber: String(form.get("phoneNumber") || "").trim()
        ? `+91${String(form.get("phoneNumber")).trim()}`
        : ""
    };
    const data = new FormData();
    data.append("item", JSON.stringify(item));
    lostFiles.forEach(file => data.append("images", file));
    setMatches([]);
    setMatchMessage("Your report is being saved and matched against found reports.");
    setSubmitting(true);
    try {
      const result = await api("/user/report/upload", { method: "POST", body: data });
      const idMatch = String(result).match(/([a-fA-F0-9]{24}|[A-Za-z0-9-]{20,})$/m);
      if (!idMatch) throw new Error("Report submitted, but no reference ID was returned.");
      lostPreviews.forEach(url => URL.revokeObjectURL(url));
      formElement.reset();
      setLostFiles([]);
      setLostPreviews([]);
      try {
        const foundMatches = await api(`/user/match/${encodeURIComponent(idMatch[1])}`);
        if (!Array.isArray(foundMatches)) throw new Error("The matching service returned an unexpected response.");
        setMatches(foundMatches);
        setMatchMessage(foundMatches.length
          ? `${foundMatches.length} possible match${foundMatches.length === 1 ? "" : "es"} found.`
          : "Your report was saved, but no likely matches were found yet. Check back as new found reports are added.");
        notify(`${foundMatches.length} visual match${foundMatches.length === 1 ? "" : "es"} found`);
      } catch (error) {
        setMatchMessage(`Your report was saved, but matching failed: ${error.message}`);
        notify(`Your report was saved, but matching failed: ${error.message}`, true);
      }
    } catch (error) {
      setMatchMessage("");
      notify(error.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => setView("browse")} aria-label="Foundly home">
          <span className="brand-mark">F</span><span>Foundly</span>
        </button>
        <nav aria-label="Main navigation">
          {["browse", "report-found", "find-item"].map((name, index) => (
            <button key={name} className={`nav-button${view === name ? " active" : ""}`} onClick={() => setView(name)}>
              {["Browse", "Report found", "Find an item"][index]}
            </button>
          ))}
        </nav>
        <span className={`service-status ${backendOnline ? "online" : "offline"}`}><i /> {backendOnline ? "Online" : "Offline"}</span>
      </header>

      {view === "browse" && (
        <main className="view">
          <div className="hero">
            <div>
              <p className="eyebrow">Community lost & found</p>
              <h1>Good things come<br />back around.</h1>
              <p className="hero-copy">Browse reports or search with a few details you remember.</p>
            </div>
            <form className="search-bar" onSubmit={descriptionSearch}>
              <label className="sr-only" htmlFor="search-description">Search descriptions</label>
              <input id="search-description" type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Try “green water bottle”" />
              <button type="submit">Search</button>
            </form>
          </div>
          <div className="browse-toolbar">
            <div><p className="eyebrow">Recent reports</p><h2>Found around you</h2></div>
            <div className="toolbar-actions">
              <label className="sr-only" htmlFor="item-filter">Filter by keyword</label>
              <input id="item-filter" type="search" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Filter results" />
              <label className="sr-only" htmlFor="item-sort">Sort items</label>
              <select id="item-sort" value={sort} onChange={event => setSort(event.target.value)}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option>
              </select>
              <button className="icon-button" type="button" onClick={() => loadItems(true)} title="Refresh reports">↻</button>
            </div>
          </div>
          {loading ? <div className="empty-state">Loading reports...</div> : !visibleItems().length ? (
            <div className="empty-state">No reports found. Try a different search or check back later.</div>
          ) : (
            <div className="items-grid">{visibleItems().map(item => <ItemCard key={item.id} item={item} confidence={item.confidence} onOpen={openDialog} />)}</div>
          )}
          {!searchMode && hasMore && !loading && (
            <button className="load-more" type="button" onClick={() => loadItems(false, page + 1)}>Load more</button>
          )}
        </main>
      )}

      {view === "report-found" && (
        <main className="view">
          <div className="form-layout">
            <aside><p className="eyebrow">Found an item?</p><h1>Help it find<br />its way home.</h1><p>Clear photos and a few useful details give the owner the best chance of recognizing it.</p>
              <ul className="tips"><li>Show the item from the front and side</li><li>Include any brand, color, or unique mark</li><li>Never share personal information in photos</li></ul>
            </aside>
            <form className="card form-card" onSubmit={submitFound}>
              <div className="form-heading"><span>1</span><div><p className="eyebrow">Found report</p><h2>Item details</h2></div></div>
              <label>Item name<input name="name" required maxLength={80} placeholder="Example: Green water bottle" /></label>
              <label>Description<textarea name="description" required maxLength={1000} rows={5} placeholder="Describe the color, brand, condition, and distinctive details" /></label>
              <label>Contact phone <span className="optional">Optional</span><span className="phone-input"><span className="phone-prefix">+91</span><input name="phoneNumber" type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national" placeholder="9876543210" /></span></label>
              <FilePicker id="found-images" name="images" title="Choose photos" files={foundFiles} previewUrls={foundPreviews}
                onFiles={files => {
                  const addedFiles = files.slice(foundFiles.length);
                  setFoundFiles(files);
                  setFoundPreviews(current => [...current, ...addedFiles.map(file => URL.createObjectURL(file))]);
                }}
                onRemove={index => {
                  URL.revokeObjectURL(foundPreviews[index]);
                  setFoundFiles(current => current.filter((_, fileIndex) => fileIndex !== index));
                  setFoundPreviews(current => current.filter((_, previewIndex) => previewIndex !== index));
                }} />
              <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Publishing..." : "Publish found report"}</button>
            </form>
          </div>
        </main>
      )}

      {view === "find-item" && (
        <main className="view">
          <div className="form-layout">
            <aside><p className="eyebrow">Lost something?</p><h1>Let’s search<br />the good finds.</h1><p>Submit a description and reference photos. The local image model compares them with found reports.</p></aside>
            <form className="card form-card" onSubmit={submitLost}>
              <div className="form-heading"><span>2</span><div><p className="eyebrow">Lost report</p><h2>What did you lose?</h2></div></div>
              <label>Your name<input name="name" required maxLength={80} autoComplete="name" placeholder="Your name" /></label>
              <label>Item description<textarea name="description" required maxLength={1000} rows={5} placeholder="Describe the item and where it may have been lost" /></label>
              <label>Contact phone <span className="optional">Optional</span><span className="phone-input"><span className="phone-prefix">+91</span><input name="phoneNumber" type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national" placeholder="9876543210" /></span></label>
              <FilePicker id="lost-images" name="images" title="Add reference photos" files={lostFiles} previewUrls={lostPreviews}
                onFiles={files => {
                  const addedFiles = files.slice(lostFiles.length);
                  setLostFiles(files);
                  setLostPreviews(current => [...current, ...addedFiles.map(file => URL.createObjectURL(file))]);
                }}
                onRemove={index => {
                  URL.revokeObjectURL(lostPreviews[index]);
                  setLostFiles(current => current.filter((_, fileIndex) => fileIndex !== index));
                  setLostPreviews(current => current.filter((_, previewIndex) => previewIndex !== index));
                }} />
              <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Matching..." : "Find matches"}</button>
            </form>
          </div>
          {matchMessage && <div className="empty-state match-status" role="status">{matchMessage}</div>}
          {!!matches.length && (
            <div className="match-results">
              <div className="browse-toolbar"><div><p className="eyebrow">{matches.length} possible match{matches.length === 1 ? "" : "es"}</p><h2>Best matches</h2></div></div>
              <div className="items-grid">{matches.map(match => <ItemCard key={match.item.id} item={match.item} confidence={match.confidence} onOpen={openDialog} />)}</div>
            </div>
          )}
        </main>
      )}

      <dialog ref={dialogRef} className="item-dialog" onClose={() => setDialogItem(null)}>
        <button className="dialog-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close details">×</button>
        {dialogItem && (
          <div className="dialog-grid">
            {imageSources(dialogItem).length
              ? <div className="dialog-gallery">{imageSources(dialogItem).map((src, index) => <img key={`${src.slice(-24)}-${index}`} src={src} alt={`${dialogItem.name || "Found item"} photo ${index + 1}`} />)}</div>
              : <div className="image-placeholder">No photo available</div>}
            <div className="dialog-copy">
              <span className="match-chip">{dialogConfidence == null ? "Community found report" : `${Math.round(dialogConfidence * 100)}% image similarity`}</span>
              <h2>{dialogItem.name || "Unnamed item"}</h2><p>{dialogItem.description || "No description provided."}</p>
              <p><strong>Reported</strong><br />{formatDate(dialogItem.createdAt)}</p>
              {dialogItem.phoneNumber && <a className="contact-link" href={`tel:${escapeUrl(dialogItem.phoneNumber)}`}>Contact the finder</a>}
            </div>
          </div>
        )}
      </dialog>
      <div className={`toast${toast.visible ? " show" : ""}${toast.error ? " error" : ""}`} role="status" aria-live="polite">{toast.message}</div>
    </>
  );
}

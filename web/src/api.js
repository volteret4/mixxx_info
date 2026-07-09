const BASE = "/api";

async function _json(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchSongs(params) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.taste?.length) params.taste.forEach((t) => qs.append("taste", t));
  if (params.label) qs.set("label", params.label);
  if (params.tag) qs.set("tag", params.tag);
  if (params.bpmMin) qs.set("bpm_min", params.bpmMin);
  if (params.bpmMax && params.bpmMax < 999) qs.set("bpm_max", params.bpmMax);
  if (params.yearMin) qs.set("year_min", params.yearMin);
  if (params.yearMax && params.yearMax < 9999) qs.set("year_max", params.yearMax);
  if (params.camelot) qs.set("camelot", params.camelot);
  if (params.compatible) qs.set("compatible", "true");
  if (params.sort) qs.set("sort", params.sort);
  if (params.sortDir) qs.set("sort_dir", params.sortDir);
  qs.set("page", params.page || 1);
  qs.set("per_page", params.perPage || 50);
  return fetch(`${BASE}/songs?${qs}`).then(_json);
}

export function fetchFilterMeta() {
  return fetch(`${BASE}/filters/meta`).then(_json);
}

export function fetchPlaylists() {
  return fetch(`${BASE}/playlists`).then(_json);
}

export function fetchPlaylist(id) {
  return fetch(`${BASE}/playlists/${id}`).then(_json);
}

export function createPlaylist(name) {
  return fetch(`${BASE}/playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(_json);
}

export function renamePlaylist(id, name) {
  return fetch(`${BASE}/playlists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(_json);
}

export function deletePlaylist(id) {
  return fetch(`${BASE}/playlists/${id}`, { method: "DELETE" });
}

export function addTrackToPlaylist(playlistId, songId) {
  return fetch(`${BASE}/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_id: songId }),
  }).then(_json);
}

export function removeTrackFromPlaylist(playlistId, songId) {
  return fetch(`${BASE}/playlists/${playlistId}/tracks/${songId}`, { method: "DELETE" });
}

export function reorderPlaylistTracks(playlistId, songIds) {
  return fetch(`${BASE}/playlists/${playlistId}/tracks/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_ids: songIds }),
  }).then(_json);
}

export function exportM3U(playlistId) {
  window.open(`${BASE}/playlists/${playlistId}/export.m3u`);
}

export function fetchSuggestions({ songId, mode, delta, taste = [] }) {
  const qs = new URLSearchParams({ song_id: songId, mode, delta });
  taste.forEach((t) => qs.append("taste", t));
  return fetch(`${BASE}/suggestions?${qs}`).then(_json);
}

export function fetchStats({ taste = [], label = "" } = {}) {
  const qs = new URLSearchParams();
  taste.forEach((t) => qs.append("taste", t));
  if (label) qs.set("label", label);
  return fetch(`/api/stats?${qs}`).then(_json);
}

export function fetchAllLabels() {
  return fetch(`/api/filters/meta`).then(_json).then((d) => d.labels || []);
}

export function fetchMusician(name) {
  const qs = new URLSearchParams({ name });
  return fetch(`${BASE}/musician?${qs}`).then(_json);
}

export function fetchSongDetail(id) {
  return fetch(`${BASE}/songs/${id}`).then(_json);
}

export function searchSongs(search, taste = []) {
  const qs = new URLSearchParams({ search, per_page: 20, page: 1 });
  taste.forEach((t) => qs.append("taste", t));
  return fetch(`${BASE}/songs?${qs}`).then(_json);
}

export function fetchAirsonicMatch(songId) {
  return fetch(`${BASE}/airsonic/match/${songId}`).then(_json);
}

export function playAirsonicJukebox(songId) {
  return fetch(`${BASE}/airsonic/jukebox/${songId}`, { method: "POST" }).then(_json);
}

/* state.js — shared data loaded once and reused across pages */
import { api } from "./api.js";

const USER_KEY = "cinebook.userId";

export const state = {
  users: [],
  movies: null,
  shows: null,
  userId: null,
};

function readStoredUser() {
  try { return Number(localStorage.getItem(USER_KEY)) || null; } catch { return null; }
}

export function setUser(id) {
  state.userId = Number(id);
  try { localStorage.setItem(USER_KEY, String(id)); } catch { /* storage unavailable */ }
}

export function currentUser() {
  return state.users.find((u) => u.user_id === state.userId) || null;
}

export async function loadUsers() {
  state.users = await api.users();
  const stored = readStoredUser();
  const valid = state.users.some((u) => u.user_id === stored);
  state.userId = valid ? stored : state.users[0]?.user_id ?? null;
  return state.users;
}

export async function getMovies(force = false) {
  if (!state.movies || force) state.movies = await api.movies();
  return state.movies;
}

export async function getShows(force = false) {
  if (!state.shows || force) state.shows = await api.shows();
  return state.shows;
}

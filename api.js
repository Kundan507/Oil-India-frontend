// api.js
//
// Every call to the backend goes through this one file. It automatically
// attaches the login token to each request, and throws a clear error
// message if something goes wrong \u2014 so the rest of the app doesn't need
// to worry about those details.
//
// IMPORTANT: change API_BASE_URL to match where your backend is running.
// - While testing on your own computer: http://localhost:4000
// - Once deployed to a real server: https://your-server-address.com

const API_BASE_URL = "http://localhost:4000";

function getToken() {
  return sessionStorage.getItem("oit_token");
}

function setToken(token) {
  if (token) sessionStorage.setItem("oit_token", token);
  else sessionStorage.removeItem("oit_token");
}

function getStoredUser() {
  const raw = sessionStorage.getItem("oit_user");
  return raw ? JSON.parse(raw) : null;
}

function setStoredUser(user) {
  if (user) sessionStorage.setItem("oit_user", JSON.stringify(user));
  else sessionStorage.removeItem("oit_user");
}

// Core request helper. Handles JSON requests; for file uploads (photos)
// pass a FormData body instead and it will skip the JSON content-type.
async function request(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!isFormData) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    throw new Error(
      "Could not reach the server. Check that the backend is running and API_BASE_URL in api.js is correct."
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // some endpoints (like /health) may return non-JSON; ignore
  }

  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed (${response.status})`);
  }

  return data;
}

export const api = {
  // ---- Auth ----
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),

  // ---- Sites ----
  getSites: () => request("/sites"),
  createSite: (site) => request("/sites", { method: "POST", body: site }),
  updateSite: (siteId, updates) => request(`/sites/${siteId}`, { method: "PATCH", body: updates }),
  deleteSite: (siteId) => request(`/sites/${siteId}`, { method: "DELETE" }),
  assignUserToSite: (siteId, userId) =>
    request(`/sites/${siteId}/assign`, { method: "POST", body: { userId } }),
  getAssignableUsers: () => request("/sites/assignable-users"),
  getSiteAssignments: (siteId) => request(`/sites/${siteId}/assignments`),
  getSiteEngineers: (siteId) => request(`/sites/${siteId}/engineers`),

  // ---- Tasks ----
  getTasks: (siteId) => request(siteId ? `/tasks?siteId=${siteId}` : "/tasks"),
  createTask: (task) => request("/tasks", { method: "POST", body: task }),
  deleteTask: (taskId) => request(`/tasks/${taskId}`, { method: "DELETE" }),
  submitTaskUpdate: (taskId, { pct, remarks, photoFile, gpsLat, gpsLng }) => {
    const form = new FormData();
    form.append("pct", pct);
    if (remarks) form.append("remarks", remarks);
    if (photoFile) form.append("photo", photoFile);
    if (gpsLat) form.append("gpsLat", gpsLat);
    if (gpsLng) form.append("gpsLng", gpsLng);
    return request(`/tasks/${taskId}/updates`, { method: "POST", body: form, isFormData: true });
  },
  approveTask: (taskId) => request(`/tasks/${taskId}/approve`, { method: "POST" }),
  rejectTask: (taskId, reason) => request(`/tasks/${taskId}/reject`, { method: "POST", body: { reason } }),
  getTaskHistory: (taskId) => request(`/tasks/${taskId}/history`),

  // ---- Users ----
  getUsers: () => request("/users"),
  createUser: (user) => request("/users", { method: "POST", body: user }),
  deactivateUser: (userId) => request(`/users/${userId}/deactivate`, { method: "PATCH" }),
  deleteUser: (userId) => request(`/users/${userId}`, { method: "DELETE" }),
  getPendingUsers: () => request("/users/pending"),
  approveUser: (userId) => request(`/users/${userId}/approve`, { method: "PATCH" }),
  rejectUser: (userId) => request(`/users/${userId}/reject`, { method: "PATCH" }),

  // ---- Reports ----
  getReportSummary: () => request("/reports/summary"),
  getActivityReport: (range) => request(`/reports/activity?range=${range}`),
  getAuditLog: () => request("/reports/audit-log"),
};

export const session = { getToken, setToken, getStoredUser, setStoredUser };
export { API_BASE_URL };

import { state } from "../../core/state.js";
import { apiRequest, clearSession } from "../../core/api.js";
import { toastSuccess, toastError } from "../../ui/toast.js";

const profileByUser = new Map();
const profileRequests = new Map();
const loadedProfileUsers = new Set();
let bound = false;
let draftAvatar = "";
let profileDirty = false;
let formUsername = "";

function currentUsername() {
  return String(state.auth?.username || "").trim();
}

function normalizeProfile(profile = {}) {
  return {
    displayName: String(profile.displayName || ""),
    avatarData: String(profile.avatarData || "")
  };
}

export function getCachedAccountProfile(username = currentUsername()) {
  return profileByUser.get(username) || { displayName: "", avatarData: "" };
}

function publishProfile(username, profile) {
  profileByUser.set(username, normalizeProfile(profile));
  loadedProfileUsers.add(username);
  window.dispatchEvent(new CustomEvent("dashboard:account-profile-updated", {
    detail: { username }
  }));
}

export function loadAccountProfile() {
  const username = currentUsername();
  if (!username) return Promise.resolve({ displayName: "", avatarData: "" });
  if (loadedProfileUsers.has(username)) return Promise.resolve(getCachedAccountProfile(username));
  if (profileRequests.has(username)) return profileRequests.get(username);

  const request = apiRequest("/api/auth/profile")
    .then((result) => {
      const profile = normalizeProfile(result?.profile);
      publishProfile(username, profile);
      return profile;
    })
    .catch((error) => {
      console.error("Falha ao carregar perfil:", error);
      return getCachedAccountProfile(username);
    })
    .finally(() => profileRequests.delete(username));
  profileRequests.set(username, request);
  return request;
}

function avatarInitial(displayName, username = currentUsername()) {
  const name = String(displayName || username || "U").trim();
  return Array.from(name)[0]?.toLocaleUpperCase("pt-BR") || "U";
}

function renderPhoto(profile) {
  const image = document.getElementById("accountPhotoImage");
  const initial = document.getElementById("accountPhotoInitial");
  const preview = document.getElementById("accountPhotoPreview");
  if (!image || !initial || !preview) return;

  const hasImage = Boolean(profile.avatarData);
  image.hidden = !hasImage;
  initial.hidden = hasImage;
  if (hasImage) image.src = profile.avatarData;
  else image.removeAttribute("src");
  initial.textContent = avatarInitial(profile.displayName);
  preview.setAttribute("aria-label", hasImage ? "Prévia da foto do perfil" : "Prévia das iniciais do perfil");
}

function renderForm(profile) {
  const displayName = document.getElementById("accountDisplayNameInput");
  if (displayName) displayName.value = profile.displayName;
  draftAvatar = profile.avatarData;
  renderPhoto(profile);
}

function readOptimizedAvatar(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("Escolha uma imagem PNG, JPG ou WebP."));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("A imagem deve ter até 8 MB."));
  }

  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Não foi possível preparar a imagem."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", 0.82);
      if (data.length > 600_000) return reject(new Error("A imagem ficou muito grande. Escolha outra foto."));
      resolve(data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("Não foi possível abrir essa imagem."));
    };
    image.src = sourceUrl;
  });
}

async function saveProfile() {
  const button = document.getElementById("accountSaveProfileButton");
  const displayName = document.getElementById("accountDisplayNameInput")?.value.trim() || "";
  if (displayName.length > 60) return toastError("O nome pode ter até 60 caracteres.");

  if (button) button.disabled = true;
  try {
    const result = await apiRequest("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName, avatarData: draftAvatar || null })
    });
    const profile = normalizeProfile(result?.profile || { displayName, avatarData: draftAvatar });
    publishProfile(currentUsername(), profile);
    profileDirty = false;
    renderForm(profile);
    toastSuccess("Perfil atualizado");
  } catch (error) {
    toastError(error?.message === "avatar_too_large"
      ? "A foto é grande demais para salvar."
      : "Não foi possível salvar o perfil.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function changePassword() {
  const currentPassword = document.getElementById("accountCurrentPassword")?.value || "";
  const newPassword = document.getElementById("accountNewPassword")?.value || "";
  const confirmPassword = document.getElementById("accountConfirmPassword")?.value || "";
  const button = document.getElementById("accountSavePasswordButton");
  if (!currentPassword || !newPassword || !confirmPassword) return toastError("Preencha os três campos de senha.");
  if (newPassword.length < 12) return toastError("A nova senha precisa ter pelo menos 12 caracteres.");
  if (newPassword !== confirmPassword) return toastError("A confirmação não corresponde à nova senha.");
  if (button) button.disabled = true;

  try {
    await apiRequest("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ username: currentUsername(), currentPassword, newPassword })
    });
    ["accountCurrentPassword", "accountNewPassword", "accountConfirmPassword"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    toastSuccess("Senha alterada. Entre novamente com a nova senha.");
    clearSession();
    window.dashboard?.setActiveScreen?.("hub");
    window.dashboard?.renderScreen?.();
  } catch (error) {
    const message = error?.message === "invalid_current_password"
      ? "A senha atual está incorreta."
      : error?.message === "password_too_short"
        ? "A nova senha precisa ter pelo menos 12 caracteres."
        : "Não foi possível alterar a senha.";
    toastError(message);
  } finally {
    if (button) button.disabled = false;
  }
}

function bindEvents() {
  document.getElementById("accountChoosePhotoButton")?.addEventListener("click", () => {
    document.getElementById("accountPhotoInput")?.click();
  });
  document.getElementById("accountPhotoInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      draftAvatar = await readOptimizedAvatar(file);
      profileDirty = true;
      renderPhoto({
        displayName: document.getElementById("accountDisplayNameInput")?.value || "",
        avatarData: draftAvatar
      });
    } catch (error) {
      toastError(error.message || "Não foi possível carregar a foto.");
    } finally {
      event.target.value = "";
    }
  });
  document.getElementById("accountRemovePhotoButton")?.addEventListener("click", () => {
    draftAvatar = "";
    profileDirty = true;
    renderPhoto({ displayName: document.getElementById("accountDisplayNameInput")?.value || "", avatarData: "" });
  });
  document.getElementById("accountDisplayNameInput")?.addEventListener("input", () => {
    profileDirty = true;
    renderPhoto({ displayName: document.getElementById("accountDisplayNameInput")?.value || "", avatarData: draftAvatar });
  });
  document.getElementById("accountSaveProfileButton")?.addEventListener("click", saveProfile);
  document.getElementById("accountSavePasswordButton")?.addEventListener("click", changePassword);
  document.getElementById("accountBackButton")?.addEventListener("click", () => {
    window.dashboard?.setActiveScreen?.("dashboard");
    window.dashboard?.renderScreen?.();
  });
}

export function init() {
  const username = currentUsername();
  if (formUsername !== username) {
    formUsername = username;
    profileDirty = false;
  }
  const cached = getCachedAccountProfile(username);
  if (!profileDirty || !document.getElementById("accountDisplayNameInput")?.value) renderForm(cached);
  if (!bound) {
    bindEvents();
    bound = true;
  }
  void loadAccountProfile().then((profile) => {
    if (username === currentUsername() && !profileDirty) renderForm(profile);
  });
}

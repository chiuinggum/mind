import { create } from "zustand";

type SettingsState = {
  apiKey: string;
  model: string;
  setApiKey: (k: string) => void;
  setModel: (m: string) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: localStorage.getItem("wbqa_openai_api_key") || "",
  model: localStorage.getItem("wbqa_openai_model") || "gpt-4o-mini",
  setApiKey: (apiKey) => {
    localStorage.setItem("wbqa_openai_api_key", apiKey);
    set({ apiKey });
  },
  setModel: (model) => {
    localStorage.setItem("wbqa_openai_model", model);
    set({ model });
  },
}));

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNoteStore } from "../stores/noteStore";
import { useTaskStore } from "../stores/taskStore";
import { useUiStore } from "../stores/uiStore";

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const ui = useUiStore.getState();
      switch (e.code) {
        case "KeyN":
          e.preventDefault();
          navigate("/notes");
          if (e.shiftKey) {
            void useNoteStore.getState().createQuickNote();
          } else {
            void useNoteStore.getState().createNoteGlobal();
          }
          break;
        case "KeyT":
          if (!e.shiftKey) {
            e.preventDefault();
            navigate("/tasks");
            useTaskStore.getState().openCreateDialog();
          }
          break;
        case "KeyF":
          e.preventDefault();
          ui.openGlobalSearch();
          break;
        case "KeyP":
          if (e.shiftKey) {
            e.preventDefault();
            ui.toggleCommandPalette();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}

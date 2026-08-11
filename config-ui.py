from __future__ import annotations

import json
import shutil
import subprocess
import threading
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

ROOT = Path(__file__).resolve().parent
CONFIG_DIR = ROOT / "user-config"
CONFIG_PATH = CONFIG_DIR / "config.json"


@dataclass
class ActivityRow:
    frame: ttk.Frame
    name_var: tk.StringVar
    weight_var: tk.StringVar


def normalize_activities(raw_activities):
    if not isinstance(raw_activities, list) or not raw_activities:
        return []

    normalized = []
    for item in raw_activities:
        if isinstance(item, str):
            name = item.strip()
            if name:
                normalized.append({"name": name, "weight": 1})
            continue
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            weight = item.get("weight", 1)
            if name:
                try:
                    weight_value = int(weight)
                except (TypeError, ValueError):
                    weight_value = 1
                normalized.append({"name": name, "weight": max(1, weight_value)})
    return normalized


class ConfigApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Arbeitszeiten Konfiguration")
        self.root.geometry("820x700")

        self.signature_source: Path | None = None
        self.activity_rows: list[ActivityRow] = []
        self.running = False
        self.generation_result: subprocess.CompletedProcess[str] | None = None

        self.year_var = tk.StringVar()
        self.name_var = tk.StringVar()
        self.department_var = tk.StringVar()
        self.max_hours_var = tk.StringVar()
        self.output_folder_var = tk.StringVar()
        self.signature_file_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Bereit")

        self._build_ui()
        self._load_config()

    def _build_ui(self) -> None:
        container = ttk.Frame(self.root, padding=12)
        container.pack(fill="both", expand=True)

        form = ttk.Frame(container)
        form.pack(fill="x")

        self._field(form, "Jahr", self.year_var, 0)
        self._field(form, "Name", self.name_var, 1)
        self._field(form, "Abteilung", self.department_var, 2)
        self._field(form, "Max. Stunden/Monat", self.max_hours_var, 3)
        self._field(form, "Output-Ordner", self.output_folder_var, 4)

        sig_frame = ttk.LabelFrame(container, text="Signatur", padding=10)
        sig_frame.pack(fill="x", pady=(12, 0))
        ttk.Entry(sig_frame, textvariable=self.signature_file_var).pack(
            side="left",
            fill="x",
            expand=True,
        )
        ttk.Button(sig_frame, text="Datei wählen", command=self._choose_signature).pack(
            side="left",
            padx=(8, 0),
        )

        activities_box = ttk.LabelFrame(container, text="Tätigkeiten", padding=10)
        activities_box.pack(fill="both", expand=True, pady=(12, 0))

        header = ttk.Frame(activities_box)
        header.pack(fill="x")
        ttk.Label(header, text="Name").pack(side="left", fill="x", expand=True)
        ttk.Label(header, text="Gewichtung", width=12).pack(side="left", padx=(8, 0))

        self.activities_scroll = tk.Canvas(activities_box, highlightthickness=0)
        scrollbar = ttk.Scrollbar(
            activities_box, orient="vertical", command=self.activities_scroll.yview
        )
        self.activities_frame = ttk.Frame(self.activities_scroll)
        self.activities_frame.bind(
            "<Configure>",
            lambda _event: self.activities_scroll.configure(
                scrollregion=self.activities_scroll.bbox("all")
            ),
        )
        self.activities_scroll.create_window(
            (0, 0), window=self.activities_frame, anchor="nw"
        )
        self.activities_scroll.configure(yscrollcommand=scrollbar.set)
        self.activities_scroll.pack(side="left", fill="both", expand=True, pady=(8, 0))
        scrollbar.pack(side="right", fill="y", pady=(8, 0))

        actions = ttk.Frame(container)
        actions.pack(fill="x", pady=(12, 0))
        ttk.Button(
            actions, text="Tätigkeit hinzufügen", command=self._add_activity_row
        ).pack(side="left")
        ttk.Button(actions, text="Speichern", command=self._save_config).pack(
            side="right", padx=(8, 0)
        )
        ttk.Button(
            actions,
            text="Speichern & PDFs erzeugen",
            command=self._save_and_generate,
        ).pack(side="right")

        status = ttk.Label(container, textvariable=self.status_var, anchor="w")
        status.pack(fill="x", pady=(10, 0))

    def _field(
        self, parent: ttk.Frame, label: str, variable: tk.StringVar, row: int
    ) -> None:
        wrapper = ttk.Frame(parent)
        wrapper.pack(fill="x", pady=(0 if row == 0 else 6, 0))
        ttk.Label(wrapper, text=label, width=18).pack(side="left")
        ttk.Entry(wrapper, textvariable=variable).pack(
            side="left", fill="x", expand=True
        )

    def _clear_activity_rows(self) -> None:
        for row in self.activity_rows:
            row.frame.destroy()
        self.activity_rows.clear()

    def _add_activity_row(self, name: str = "", weight: str = "1") -> None:
        row_frame = ttk.Frame(self.activities_frame)
        row_frame.pack(fill="x", pady=3)

        name_var = tk.StringVar(value=name)
        weight_var = tk.StringVar(value=weight)

        ttk.Entry(row_frame, textvariable=name_var).pack(
            side="left", fill="x", expand=True
        )
        ttk.Entry(row_frame, textvariable=weight_var, width=10).pack(
            side="left", padx=(8, 0)
        )
        ttk.Button(
            row_frame,
            text="Entfernen",
            command=lambda: self._remove_activity_row(row_frame),
        ).pack(side="left", padx=(8, 0))

        self.activity_rows.append(ActivityRow(row_frame, name_var, weight_var))

    def _remove_activity_row(self, row_frame: ttk.Frame) -> None:
        for row in list(self.activity_rows):
            if row.frame is row_frame:
                row.frame.destroy()
                self.activity_rows.remove(row)
                break

    def _choose_signature(self) -> None:
        file_path = filedialog.askopenfilename(
            title="Signaturbild auswählen",
            initialdir=str(CONFIG_DIR),
            filetypes=[
                ("Bilddateien", "*.png *.jpg *.jpeg"),
                ("PNG", "*.png"),
                ("JPEG", "*.jpg *.jpeg"),
            ],
        )
        if file_path:
            path = Path(file_path)
            self.signature_file_var.set(path.name)
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            destination = CONFIG_DIR / path.name
            shutil.copy2(path, destination)
            self.signature_source = destination

    def _load_config(self) -> None:
        if not CONFIG_PATH.exists():
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            self.year_var.set("2026")
            self.max_hours_var.set("10")
            self.output_folder_var.set("2026")
            self.name_var.set("")
            self.department_var.set("")
            self.signature_file_var.set("")
            self._clear_activity_rows()
            self._add_activity_row()
            return

        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        self.year_var.set(str(data.get("year", "")))
        self.name_var.set(str(data.get("name", "")))
        self.department_var.set(str(data.get("department", "")))
        self.max_hours_var.set(str(data.get("maxHoursPerMonth", 10)))
        self.output_folder_var.set(str(data.get("outputFolder", "")))
        self.signature_file_var.set(str(data.get("signatureImage", "")))
        signature_name = self.signature_file_var.get().strip()
        self.signature_source = (CONFIG_DIR / signature_name).resolve() if signature_name else None

        self._clear_activity_rows()
        activities = normalize_activities(data.get("activities"))
        if not activities:
            self._add_activity_row()
        else:
            for activity in activities:
                self._add_activity_row(activity["name"], str(activity["weight"]))

    def _collect_config(self) -> dict:
        try:
            year = int(self.year_var.get().strip())
            max_hours = int(self.max_hours_var.get().strip())
        except ValueError as exc:
            raise ValueError("Jahr und Max. Stunden müssen Zahlen sein.") from exc

        name = self.name_var.get().strip()
        department = self.department_var.get().strip()
        signature_filename = self.signature_file_var.get().strip()
        output_folder = self.output_folder_var.get().strip()

        if not name:
            raise ValueError("Name darf nicht leer sein.")
        if not department:
            raise ValueError("Abteilung darf nicht leer sein.")
        if not signature_filename:
            raise ValueError("Signaturdatei darf nicht leer sein.")

        activities = []
        for row in self.activity_rows:
            activity_name = row.name_var.get().strip()
            if not activity_name:
                continue
            try:
                weight = int(row.weight_var.get().strip())
            except ValueError as exc:
                raise ValueError(
                    f"Gewichtung für '{activity_name}' muss eine Zahl sein."
                ) from exc
            if weight <= 0:
                raise ValueError(
                    f"Gewichtung für '{activity_name}' muss größer als 0 sein."
                )
            activities.append({"name": activity_name, "weight": weight})

        if not activities:
            raise ValueError("Mindestens eine Tätigkeit ist erforderlich.")

        signature_destination = CONFIG_DIR / signature_filename
        if not signature_destination.exists():
            raise ValueError(
                "Die konfigurierte Signaturdatei existiert nicht im user-config-Ordner."
            )

        config = {
            "year": year,
            "name": name,
            "department": department,
            "signatureImage": signature_filename,
            "maxHoursPerMonth": max_hours,
            "activities": activities,
        }
        if output_folder:
            config["outputFolder"] = output_folder

        return config

    def _save_config(self) -> None:
        try:
            config = self._collect_config()
        except ValueError as exc:
            messagebox.showerror("Ungültige Eingabe", str(exc))
            return

        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(
            json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        self.signature_source = (CONFIG_DIR / config["signatureImage"]).resolve()
        self.status_var.set("Konfiguration gespeichert.")
        messagebox.showinfo("Gespeichert", "Die Konfiguration wurde gespeichert.")

    def _set_running(self, running: bool) -> None:
        self.running = running

    def _save_and_generate(self) -> None:
        try:
            config = self._collect_config()
        except ValueError as exc:
            messagebox.showerror("Ungültige Eingabe", str(exc))
            return

        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(
            json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        self.signature_source = (CONFIG_DIR / config["signatureImage"]).resolve()
        self.status_var.set("PDF-Erzeugung läuft ...")
        self.root.config(cursor="watch")
        self._set_running(True)
        self.generation_result = None

        thread = threading.Thread(target=self._run_generation_command, daemon=True)
        thread.start()
        self.root.after(150, lambda: self._poll_generation_thread(thread))

    def _poll_generation_thread(self, thread: threading.Thread) -> None:
        if thread.is_alive():
            self.root.after(150, lambda: self._poll_generation_thread(thread))
            return

        self.root.config(cursor="")
        self._set_running(False)
        result = self.generation_result
        if result is None:
            self.status_var.set("PDF-Erzeugung fehlgeschlagen.")
            messagebox.showerror(
                "Fehler beim Erzeugen",
                "Der PDF-Lauf hat kein Ergebnis geliefert.",
            )
            return

        if result.returncode == 0:
            self.status_var.set("PDFs erfolgreich erzeugt.")
            messagebox.showinfo("Erfolg", "PDFs wurden erfolgreich erzeugt.")
        else:
            self.status_var.set("PDF-Erzeugung fehlgeschlagen.")
            messagebox.showerror(
                "Fehler beim Erzeugen",
                (result.stdout or "") + "\n" + (result.stderr or ""),
            )

    def _run_generation_command(self) -> None:
        self.generation_result = subprocess.run(
            "npm run start",
            cwd=ROOT,
            capture_output=True,
            text=True,
            shell=True,
        )


def main() -> None:
    root = tk.Tk()
    ConfigApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

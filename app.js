"use strict";

const STORAGE_KEY = "agile-planner-druzhko-v1";
const STATUS_ORDER = ["backlog", "todo", "doing", "done"];
const STATUS_LABEL = { backlog: "Бэклог", todo: "К выполнению", doing: "В работе", done: "Готово" };
const PRIORITY_LABEL = { low: "Низкий", medium: "Средний", high: "Высокий" };
const POINTS = [1, 2, 3, 5, 8, 13];
const DEFAULT_STATE = () => ({ version: 1, sprint: { name: "Спринт 1", goal: "", startDate: "", endDate: "" }, tasks: [] });

const $ = (selector) => document.querySelector(selector);
let state = loadState();
let messageTimer;

function showMessage(message, isError = false) {
  const box = $("#message");
  box.textContent = message;
  box.classList.toggle("error", isError);
  box.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => box.classList.remove("visible"), 4200);
}

function isValidState(value) {
  if (!value || value.version !== 1 || !value.sprint || !Array.isArray(value.tasks)) return false;
  const sprint = value.sprint;
  if (["name", "goal", "startDate", "endDate"].some((key) => typeof sprint[key] !== "string")) return false;
  const ids = new Set();
  return value.tasks.every((task) => {
    if (!task || typeof task.id !== "string" || !task.id || ids.has(task.id)) return false;
    ids.add(task.id);
    return typeof task.title === "string" && task.title.trim().length > 0 && task.title.length <= 100 &&
      typeof task.description === "string" && task.description.length <= 500 &&
      Object.hasOwn(PRIORITY_LABEL, task.priority) && POINTS.includes(task.points) &&
      STATUS_ORDER.includes(task.status) && typeof task.inSprint === "boolean" &&
      task.inSprint === (task.status !== "backlog") && typeof task.createdAt === "string";
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE();
    const parsed = JSON.parse(raw);
    return isValidState(parsed) ? parsed : DEFAULT_STATE();
  } catch {
    return DEFAULT_STATE();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showMessage("Не удалось сохранить данные в браузере. Экспортируйте резервную копию.", true);
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeButton(label, action, id, extraClass = "") {
  const button = makeElement("button", `button small ${extraClass}`.trim(), label);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function renderCard(task) {
  const card = makeElement("article", `task-card priority-${task.priority}`);
  card.append(makeElement("h4", "", task.title));
  if (task.description) card.append(makeElement("p", "", task.description));
  const meta = makeElement("div", "task-meta");
  meta.append(makeElement("span", "pill", `Приоритет: ${PRIORITY_LABEL[task.priority]}`));
  meta.append(makeElement("span", "pill", `${task.points} балл${task.points === 1 ? "" : task.points < 5 ? "а" : "ов"}`));
  card.append(meta);
  const actions = makeElement("div", "task-actions");
  const index = STATUS_ORDER.indexOf(task.status);
  if (index > 0) actions.append(makeButton("Назад", "back", task.id, "secondary"));
  if (index < STATUS_ORDER.length - 1) actions.append(makeButton("Далее", "forward", task.id, "secondary"));
  actions.append(makeButton("Редактировать", "edit", task.id, "secondary"));
  actions.append(makeButton("Удалить", "delete", task.id, "danger"));
  card.append(actions);
  return card;
}

function renderBoard() {
  const search = $("#search").value.trim().toLocaleLowerCase("ru");
  const priority = $("#priority-filter").value;
  const visible = state.tasks.filter((task) =>
    (priority === "all" || task.priority === priority) &&
    (!search || `${task.title} ${task.description}`.toLocaleLowerCase("ru").includes(search))
  );
  for (const status of STATUS_ORDER) {
    const list = $(`#${status}-list`);
    list.replaceChildren();
    const tasks = visible.filter((task) => task.status === status);
    for (const task of tasks) list.append(renderCard(task));
    if (tasks.length === 0) list.append(makeElement("p", "empty-column", "Здесь пока нет задач."));
    $(`#${status}-count`).textContent = String(state.tasks.filter((task) => task.status === status).length);
  }
  $("#result-count").textContent = visible.length === state.tasks.length
    ? `Всего задач: ${state.tasks.length}`
    : `Показано задач: ${visible.length} из ${state.tasks.length}`;
}

function renderSummary() {
  const sprint = state.sprint;
  $("#summary-title").textContent = sprint.name || "Текущий спринт";
  $("#sprint-goal-display").textContent = sprint.goal || "Цель спринта пока не указана.";
  $("#sprint-period").textContent = sprint.startDate && sprint.endDate
    ? `${sprint.startDate} — ${sprint.endDate}` : "Даты не заданы";
  const planned = state.tasks.filter((task) => task.inSprint);
  const done = planned.filter((task) => task.status === "done");
  const allPoints = planned.reduce((sum, task) => sum + task.points, 0);
  const donePoints = done.reduce((sum, task) => sum + task.points, 0);
  const percentage = allPoints ? Math.round(donePoints / allPoints * 100) : 0;
  $("#stat-planned").textContent = String(planned.length);
  $("#stat-done").textContent = String(done.length);
  $("#stat-points").textContent = `${donePoints} / ${allPoints}`;
  $("#stat-progress").textContent = `${percentage}%`;
  $("#progress-fill").style.width = `${percentage}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(percentage));
}

function render() {
  renderSummary();
  renderBoard();
}

function resetTaskForm() {
  $("#task-form").reset();
  $("#task-id").value = "";
  $("#task-points").value = "3";
  $("#task-in-sprint").checked = true;
  $("#task-form-title").textContent = "Новая задача";
  $("#task-submit").textContent = "Добавить задачу";
  $("#task-cancel").classList.add("hidden");
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const title = $("#task-title").value.trim();
  if (!title || title.length > 100) {
    showMessage("Введите название задачи длиной от 1 до 100 символов.", true);
    $("#task-title").focus();
    return;
  }
  const description = $("#task-description").value.trim();
  const priority = $("#task-priority").value;
  const points = Number($("#task-points").value);
  const inSprint = $("#task-in-sprint").checked;
  const id = $("#task-id").value;
  if (!Object.hasOwn(PRIORITY_LABEL, priority) || !POINTS.includes(points)) return;
  if (id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    Object.assign(task, { title, description, priority, points, inSprint });
    if (!inSprint) task.status = "backlog";
    else if (task.status === "backlog") task.status = "todo";
    showMessage("Задача обновлена.");
  } else {
    state.tasks.push({ id: newId(), title, description, priority, points,
      status: inSprint ? "todo" : "backlog", inSprint, createdAt: new Date().toISOString() });
    showMessage("Задача добавлена.");
  }
  saveState();
  resetTaskForm();
  render();
}

function handleCardAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const task = state.tasks.find((item) => item.id === button.dataset.id);
  if (!task) return;
  const action = button.dataset.action;
  if (action === "delete") {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return;
    state.tasks = state.tasks.filter((item) => item.id !== task.id);
    if ($("#task-id").value === task.id) resetTaskForm();
    showMessage("Задача удалена.");
  } else if (action === "edit") {
    $("#task-id").value = task.id;
    $("#task-title").value = task.title;
    $("#task-description").value = task.description;
    $("#task-priority").value = task.priority;
    $("#task-points").value = String(task.points);
    $("#task-in-sprint").checked = task.inSprint;
    $("#task-form-title").textContent = "Редактирование задачи";
    $("#task-submit").textContent = "Сохранить задачу";
    $("#task-cancel").classList.remove("hidden");
    $("#task-title").focus();
    $("#task-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  } else {
    const current = STATUS_ORDER.indexOf(task.status);
    const next = current + (action === "forward" ? 1 : -1);
    if (next < 0 || next >= STATUS_ORDER.length) return;
    task.status = STATUS_ORDER[next];
    task.inSprint = task.status !== "backlog";
    showMessage(`Задача перенесена: ${STATUS_LABEL[task.status]}.`);
  }
  saveState();
  render();
}

function fillSprintForm() {
  $("#sprint-name").value = state.sprint.name;
  $("#sprint-goal").value = state.sprint.goal;
  $("#sprint-start").value = state.sprint.startDate;
  $("#sprint-end").value = state.sprint.endDate;
}

function handleSprintSubmit(event) {
  event.preventDefault();
  const name = $("#sprint-name").value.trim();
  const goal = $("#sprint-goal").value.trim();
  const startDate = $("#sprint-start").value;
  const endDate = $("#sprint-end").value;
  if (!name) { showMessage("Укажите название спринта.", true); return; }
  if (startDate && endDate && endDate < startDate) {
    showMessage("Дата окончания должна быть не раньше даты начала.", true);
    return;
  }
  state.sprint = { name, goal, startDate, endDate };
  saveState();
  renderSummary();
  showMessage("Параметры спринта сохранены.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "agile-planner-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Резервная копия сохранена.");
}

async function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!isValidState(parsed)) throw new Error("Неверная структура JSON");
    if (!confirm("Заменить текущие задачи и параметры спринта данными из файла?")) return;
    state = parsed;
    saveState();
    resetTaskForm();
    fillSprintForm();
    render();
    showMessage("Данные восстановлены из файла.");
  } catch {
    showMessage("Файл не похож на резервную копию планировщика. Текущие данные сохранены.", true);
  }
}

function loadDemo() {
  if (state.tasks.length && !confirm("Заменить текущие задачи учебным примером?")) return;
  const sample = [
    ["Собрать идеи для бэклога", "Записать задачи и ожидаемые результаты", "medium", 2, "backlog"],
    ["Подготовить макет доски", "Определить колонки и форму задачи", "high", 3, "todo"],
    ["Реализовать сохранение", "Проверить работу localStorage", "high", 5, "doing"],
    ["Описать требования", "Согласовать критерии приёмки", "medium", 3, "done"],
    ["Составить инструкцию", "Добавить шаги для нового пользователя", "low", 2, "todo"]
  ];
  state = {
    version: 1,
    sprint: { name: "Учебный спринт", goal: "Подготовить первую версию личного планировщика", startDate: "", endDate: "" },
    tasks: sample.map(([title, description, priority, points, status]) => ({
      id: newId(), title, description, priority, points, status,
      inSprint: status !== "backlog", createdAt: new Date().toISOString()
    }))
  };
  saveState();
  resetTaskForm();
  fillSprintForm();
  render();
  showMessage("Учебный пример загружен.");
}

$("#task-form").addEventListener("submit", handleTaskSubmit);
$("#task-cancel").addEventListener("click", resetTaskForm);
$(".board").addEventListener("click", handleCardAction);
$("#sprint-form").addEventListener("submit", handleSprintSubmit);
$("#search").addEventListener("input", renderBoard);
$("#priority-filter").addEventListener("change", renderBoard);
$("#export-button").addEventListener("click", exportData);
$("#import-button").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", importData);
$("#demo-button").addEventListener("click", loadDemo);

fillSprintForm();
render();

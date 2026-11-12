const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const PROJECT_FILTER = { name: 'GI Sheet Project', extensions: ['gisheet'] };
const gotLock = app.requestSingleInstanceLock();
let win;
let currentFile = null;
let dirty = false;
let closing = false;
let pendingFile = null;
let recent = [];

if (!gotLock) app.quit();

function recentPath() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

function loadRecent() {
  try {
    const data = JSON.parse(fs.readFileSync(recentPath(), 'utf8'));
    recent = Array.isArray(data) ? data.filter(p => typeof p === 'string' && fs.existsSync(p)).slice(0, 8) : [];
  } catch {
    recent = [];
  }
}

function saveRecent() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(recentPath(), JSON.stringify(recent, null, 2));
}

function remember(filePath) {
  recent = [filePath, ...recent.filter(p => p !== filePath)].filter(p => fs.existsSync(p)).slice(0, 8);
  saveRecent();
}

function setDirty(value) {
  dirty = Boolean(value);
  if (win && !win.isDestroyed()) {
    const name = currentFile ? path.basename(currentFile) : 'Untitled';
    win.setTitle(`${name}${dirty ? ' *' : ''} - GI Sheet Optimizer`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    setDirty(dirty);
    if (pendingFile) {
      const filePath = pendingFile;
      pendingFile = null;
      openProject(filePath);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', event => {
    if (!dirty || closing) return;
    event.preventDefault();
    confirmChanges().then(ok => {
      if (ok) {
        closing = true;
        win.close();
      }
    });
  });
}

async function savePdf() {
  const result = await dialog.showSaveDialog(win, {
    title: 'Export cutting plan as PDF',
    defaultPath: 'GI-Cutting-Plan.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', marginsType: 1 });
  fs.writeFileSync(result.filePath, data);
  shell.showItemInFolder(result.filePath);
  return { saved: true, filePath: result.filePath };
}

async function getRendererData() {
  return win.webContents.executeJavaScript('window.getProjectData()');
}

async function saveProject(saveAs) {
  let filePath = currentFile;
  if (saveAs || !filePath) {
    const result = await dialog.showSaveDialog(win, {
      title: saveAs ? 'Save GI Sheet Project As' : 'Save GI Sheet Project',
      defaultPath: filePath || 'Untitled.gisheet',
      filters: [PROJECT_FILTER]
    });
    if (result.canceled || !result.filePath) return false;
    filePath = result.filePath.toLowerCase().endsWith('.gisheet') ? result.filePath : `${result.filePath}.gisheet`;
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(await getRendererData(), null, 2), 'utf8');
    currentFile = filePath;
    setDirty(false);
    remember(filePath);
    buildMenu();
    return true;
  } catch (error) {
    dialog.showErrorBox('Could not save project', error.message);
    return false;
  }
}

async function openProject(filePath) {
  if (!filePath || !win || win.isDestroyed()) return false;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    win.webContents.send('project:load', data);
    currentFile = filePath;
    setDirty(false);
    remember(filePath);
    buildMenu();
    return true;
  } catch (error) {
    dialog.showErrorBox('Could not open project', error.message);
    return false;
  }
}

async function confirmChanges() {
  if (!dirty) return true;
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'This project has unsaved changes.',
    detail: 'Save them before continuing?'
  });
  if (result.response === 2) return false;
  return result.response === 0 ? saveProject(false) : true;
}

async function newProject() {
  if (!(await confirmChanges())) return;
  currentFile = null;
  setDirty(false);
  win.webContents.send('project:new');
}

async function chooseOpen(filePath) {
  if (!(await confirmChanges())) return;
  if (!filePath) {
    const result = await dialog.showOpenDialog(win, {
      title: 'Open GI Sheet Project',
      properties: ['openFile'],
      filters: [PROJECT_FILTER]
    });
    if (result.canceled) return;
    filePath = result.filePaths[0];
  }
  await openProject(filePath);
}

function buildMenu() {
  const recentMenu = recent.length
    ? recent.map(filePath => ({ label: path.basename(filePath), sublabel: filePath, click: () => chooseOpen(filePath) }))
    : [{ label: 'No Recent Files', enabled: false }];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: newProject },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => chooseOpen() },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => saveProject(false) },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => saveProject(true) },
        { label: 'Export as PDF…', accelerator: 'CmdOrCtrl+Shift+P', click: savePdf },
        { label: 'Recent Files', submenu: recentMenu },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
  ]));
}

app.whenReady().then(() => {
  if (!gotLock) return;
  loadRecent();
  ipcMain.handle('save-pdf', savePdf);
  ipcMain.handle('project:get-data', getRendererData);
  ipcMain.on('project:dirty', () => setDirty(true));
  buildMenu();
  createWindow();
  const startupFile = process.argv.slice(1).find(arg => arg.toLowerCase().endsWith('.gisheet'));
  if (startupFile) pendingFile = path.resolve(startupFile);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', (_event, commandLine) => {
  const filePath = commandLine.find(arg => arg.toLowerCase().endsWith('.gisheet'));
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  if (filePath) chooseOpen(path.resolve(filePath));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

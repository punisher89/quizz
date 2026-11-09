'use strict';
const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 925, minWidth: 830, minHeight: 640,
    backgroundColor: '#0d1020', title: 'Квиз-Круг',
    autoHideMenuBar: true, icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '../index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

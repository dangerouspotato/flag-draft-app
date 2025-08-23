// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',  // Activates dark mode
    primary: {
      main: '#2b7a78'
    },
    secondary: {
      main: '#3aafa9'
    },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif'
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider theme={darkTheme}>
    <App />
  </ThemeProvider>
);


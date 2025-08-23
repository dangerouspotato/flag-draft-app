// App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import ManagerDashboard from './ManagerDashboard';
import SpectatorView from './SpectatorView';
import ManagerLogin from './ManagerLogin';
import {
  Box,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import draftImage from './logo.PNG'; // Import your image

const drawerWidth = 240;

function ProtectedRoute({ isAuthenticated, children }) {
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#2b7a78',
      },
      secondary: {
        main: '#3aafa9',
      },
    },
    typography: {
      fontFamily: 'Roboto, sans-serif',
    },
  });

  return (
    <ThemeProvider theme={darkTheme}>
      <Router>
        <Box sx={{ display: 'flex' }}>
          <CssBaseline />
          {/* Top App Bar */}
          <AppBar
            position="fixed"
            sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
          >
            <Toolbar>
              <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 29, textAlign: 'left' }}>
                Legacy Flag Football League
              </Typography>
            </Toolbar>
          </AppBar>

          {/* Permanent Sidebar */}
          <Drawer
            variant="permanent"
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: drawerWidth,
                boxSizing: 'border-box',
              },
            }}
          >
            <Toolbar />
            <List>
              <ListItem disablePadding>
                <ListItemButton component={Link} to="/manager">
                  <ListItemText primary="Manager Dashboard" variant='h4'/>
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton component={Link} to="/spectator">
                  <ListItemText primary="Spectator View" variant='h4'/>
                </ListItemButton>
              </ListItem>
            </List>
          </Drawer>

          {/* Main Content */}
          <Box
            component="main"
            sx={{ flexGrow: 1, p: 3, ml: `${drawerWidth}px` }}
          >
            <Toolbar />
            <Routes>
              <Route
                path="/login"
                element={<ManagerLogin setIsAuthenticated={setIsAuthenticated} />}
              />
              <Route
                path="/manager"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ManagerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/spectator" element={<SpectatorView />} />
              <Route
                path="/"
                element={
                  <Box>
                    <Typography variant="h4" gutterBottom sx={{ flexGrow: 29, textAlign: 'center' }}>
                      Welcome to Flag Football Draft Day
                    </Typography>
                    <Typography variant="body1" sx={{ flexGrow: 29, textAlign: 'center' }}>
                      Select an option from the navigation on the left.
                    </Typography>
                    <Typography variant="body1" sx={{ flexGrow: 29, textAlign: 'center' }}>
                      If you are spectator, select the spectator view, grab some popcorn, and wait to be drafted.
                    </Typography>
                    <Typography variant="body1" sx={{ flexGrow: 29, textAlign: 'center' }}>
                      To start and manage the draft, select the manager view. Make sure to have the proper sign in information.
                    </Typography>
                    <img
                      src={draftImage}
                      alt="Flag Football Draft Day"
                      style={{ width: '100%', maxWidth: '600px', margin: '20px auto', display: 'block', textAlign:'center'}}
                    />
                  </Box>
                }
              />
            </Routes>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;





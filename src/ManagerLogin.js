// ManagerLogin.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function ManagerLogin({ setIsAuthenticated }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setCredentials({...credentials, [e.target.name]: e.target.value});
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post('/api/login', credentials, { withCredentials: true });
      setIsAuthenticated(true);
      navigate('/manager');
    } catch (err) {
      console.error(err);
      alert('Invalid login');
    }
  };

  return (
    <div>
      <h2>Manager Login</h2>
      <input name="username" placeholder="Username" onChange={handleChange} />
      <input name="password" placeholder="Password" type="password" onChange={handleChange} />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}

export default ManagerLogin;

/**
 * Socket.IO Client Manager
 * Handles all real-time communication with the server
 */

class SocketManager {
  constructor() {
    this.socket = io();
    this.playerId = null;
    this.isConnected = false;

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  }

  join(playerName, divisionId) {
    this.socket.emit('playerJoin', { name: playerName, divisionId });
  }

  sendMoveInput(input) {
    this.socket.emit('moveInput', input);
  }

  sendAttack() {
    this.socket.emit('attack', {});
  }

  sendKatanaSwipe(angle) {
    this.socket.emit('katanaSwipe', { angle });
  }

  sendFireball(angle) {
    this.socket.emit('castFireball', { angle });
  }

  on(event, callback) {
    this.socket.on(event, callback);
  }

  off(event, callback) {
    this.socket.off(event, callback);
  }
}

// Create global socket manager
const socketManager = new SocketManager();

/**
 * Common utilities and shared data structure
 */

module.exports = {
	// verssion constant
    VER : 1,
    
    // command constants
    CONN_SYNC : 1,		// client connection initialization
    CONN_SYNC_ACK : 2,	// server connection sync-ack    
    CONN_ACK : 3,		// client connection ack
    DCONN: 4,			// client disconnect request
    PING: 5,			// server ping
    PING_ACK: 6,		// client ping ack
    TERM: 7,			// server termination
    EVT: 8,				// application event,
    RECONN: 9			// client reconnect
}
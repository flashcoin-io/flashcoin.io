/*********************************************************************************************
 * @author Sriram M <sriram@unseen.is>
 * @date 29-Aug-2014 10:30
 *
 * This is a basic server for multigroup anonymous chat.
 *
 **********************************************************************************************/

var Command = {
	JOIN: '1',
	SEND: '2',
	RECV: '3',
	STATS : '5',
	LEAVE : '6',
	INPUT_ERROR : '500'
}

module.exports = Command;
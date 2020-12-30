const app = require("express")();
const http_server = require("http").createServer(app);
const options = {
	/*
		CORS policy (Access-Control-Allow-Origin)

		參考: https://www.npmjs.com/package/cors
	*/
	cors: {
		origin: /\.smoking\.gov$/,
		credentials: true
	}
};
// io 是 Server 的實例 (參考: https://socket.io/docs/v3/server-api/#Server)
const io = require("socket.io")(http_server, options);




// Express 參考: https://expressjs.com/en/4x/api.html#res
app.get("/", (req, res) => {
	res.send("Express index");
});
app.get("/notify", (req, res) => {
	if (req.query.msg) {
		/* send 等於 emit message event
		io.emit("message", req.query.msg);
		*/
		io.send(`From system: ${req.query.msg}`);
	}
	res.end();
});




// 註冊一個 middleware 驗證用戶身份 (將 user_id 當作 socket 屬性)
let user_ids = [];

io.use(async (socket, next) => {
	try {
		let user_id = await fetchUserId(socket);
		if (user_ids.indexOf(user_id) != -1) {
			throw new Error("User ID 重覆.");
		} else {
			user_ids.push(user_id);
			/* middleware 裡的廣播，連線者會收不到
			io.emit("userIdsUpdated", {user_ids: user_ids});
			*/
		}
		socket.user_id = user_id;
		next();
	} catch (e) {
		next(new Error(`Unknown user. (${e.message})`));
	}
});

io.on("connection", (socket) => {
	/*
		socket 是用來和 client 互動的 class
		每個連結都會有一個 socket
		這裡的 socket 不是指 TCP/IP 的 socket，而是 class 的名字

		參考: https://socket.io/docs/v3/server-api/#Socket
	*/
	log(`Connected user #${socket.user_id}.`);

	socket.on("disconnecting", (reason) => {
		// 該事件會在 disconnect 之前觸發，在這裡也無法傳送訊息給斷線的 client
		log(`Disconnecting user #${socket.user_id}. (reason: ${reason})`);
	});

	socket.on("disconnect", () => {
		log(`Disconnected user #${socket.user_id}.`);

		socket.broadcast.send(`User #${socket.user_id} has left.`);		// 廣播訊息 (不包含自己)
		user_ids = user_ids.filter(function (value, index, arr) {
			return value != socket.user_id;
		});
		io.emit("userIdsUpdated", {user_ids: user_ids});
	});

	// 底下是測試
	socket.on("message", (msg, send_to) => {
		// 各種發送訊息的方式，參考: https://socket.io/docs/v3/emit-cheatsheet/
		if (send_to == "all") {
			// 廣播訊息 (包含自己)
			io.send(`User #${socket.user_id} said: ${msg}`);
		} else if (send_to == socket.user_id) {
			// 發送給自己
			socket.send(`You said: ${msg}`);
		} else {
			/*
				發送給別人 (私訊)

					io.of("/") 等於 io.sockets ("/" 是預設的 namespace)
			*/
			io.of("/").sockets.forEach(function (_socket, socket_id) {
				if (send_to == _socket.user_id) {
					_socket.send(`From user #${socket.user_id}: ${msg}`);
				}
			});
		}
	});

	socket.send(`Welcome user #${socket.user_id} ~`);
	socket.broadcast.send(`User #${socket.user_id} joined.`);
	io.emit("userIdsUpdated", {user_ids: user_ids});
});




// 自訂 Functions
function fetchUserId(socket) {
	let query = socket.handshake.query;

	if (! query.user_id) {
		throw new Error("No user_id.");
	} else if (query.user_id<1 || query.user_id>10) {
		throw new Error("user_id < 1 || user_id > 10.");
	}

	return query.user_id;
}

function getDate() {
	return new Date().toISOString()
		.replace(/T/, " ")		// replace T with a space
		.replace(/\..+/, "");	// delete the dot and everything after
}

function getClassMethods(cl) {
	return Object.getOwnPropertyNames(cl);	// return array
}

function log(data) {
	// 註: null 也是 object (參考: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof)
	if (typeof(data)=="object" && data!==null) {
		// 轉成 JSON string
		data = JSON.stringify(data);
	}
	console.log(`${getDate()}\n${data}\n\n`);
}




http_server.listen(3000);

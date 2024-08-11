import { serve } from "bun";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// Types
interface User {
  id: number;
  username: string;
  password: string;
  role: "user" | "admin";
}

interface LottoTicket {
  id: number;
  userId: number;
  number: string; // 6-digit number
  drawDate: string;
  status: "pending" | "won" | "lost";
  prizeAmount: number;
}

interface LottoDraw {
  id: number;
  date: string;
  winningNumber: string; // 6-digit number
  firstThreeDigits: string;
  lastThreeDigits: string;
  lastTwoDigits: string;
}

// In-memory stores
let users: User[] = [];
let lottoTickets: LottoTicket[] = [];
let lottoDraws: LottoDraw[] = [];
let nextUserId = 1;
let nextTicketId = 1;
let nextDrawId = 1;

const JWT_SECRET = "your-secret-key"; // In production, use an environment variable

// Helper functions
const generateToken = (user: User) => {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
};

const authenticateToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as User;
  } catch {
    return null;
  }
};

const isAdmin = (user: User | null) => user?.role === "admin";

const getNextDrawDate = () => {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  
  if (day < 16) {
    return new Date(year, month, 16).toISOString().split('T')[0];
  } else {
    return new Date(year, month + 1, 1).toISOString().split('T')[0];
  }
};

const checkWinningStatus = (ticket: LottoTicket, draw: LottoDraw): [string, number] => {
  if (ticket.number === draw.winningNumber) return ["won", 6000000]; // First prize: 6 million baht
  if (ticket.number.slice(-3) === draw.lastThreeDigits) return ["won", 4000]; // Last 3 digits prize
  if (ticket.number.slice(-2) === draw.lastTwoDigits) return ["won", 2000]; // Last 2 digits prize
  if (ticket.number.slice(0, 3) === draw.firstThreeDigits) return ["won", 4000]; // First 3 digits prize
  
  // Check for running numbers (1 up and 1 down from the winning number)
  const ticketNum = parseInt(ticket.number);
  const winningNum = parseInt(draw.winningNumber);
  if (ticketNum === winningNum + 1 || ticketNum === winningNum - 1) return ["won", 100000]; // Running number prize: 100,000 baht

  return ["lost", 0];
};

const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Authentication routes
    if (path === "/api/register" && method === "POST") {
      const { username, password } = await req.json();
      if (users.some(u => u.username === username)) {
        return new Response("Username already exists", { status: 400 });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser: User = { id: nextUserId++, username, password: hashedPassword, role: "user" };
      users.push(newUser);
      const token = generateToken(newUser);
      return new Response(JSON.stringify({ token }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/api/login" && method === "POST") {
      const { username, password } = await req.json();
      const user = users.find(u => u.username === username);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return new Response("Invalid credentials", { status: 401 });
      }
      const token = generateToken(user);
      return new Response(JSON.stringify({ token }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Authenticated routes
    const user = authenticateToken(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // User routes
    if (path === "/api/tickets" && method === "POST") {
      const { number } = await req.json();
      if (!/^\d{6}$/.test(number)) {
        return new Response("Invalid ticket number. Must be 6 digits.", { status: 400 });
      }
      const newTicket: LottoTicket = {
        id: nextTicketId++,
        userId: user.id,
        number,
        drawDate: getNextDrawDate(),
        status: "pending",
        prizeAmount: 0,
      };
      lottoTickets.push(newTicket);
      return new Response(JSON.stringify(newTicket), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/api/tickets" && method === "GET") {
      const userTickets = lottoTickets.filter(t => t.userId === user.id);
      return new Response(JSON.stringify(userTickets), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin routes
    if (!isAdmin(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (path === "/api/draw" && method === "POST") {
      const winningNumber = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const newDraw: LottoDraw = {
        id: nextDrawId++,
        date: getNextDrawDate(),
        winningNumber,
        firstThreeDigits: winningNumber.slice(0, 3),
        lastThreeDigits: winningNumber.slice(-3),
        lastTwoDigits: winningNumber.slice(-2),
      };
      lottoDraws.push(newDraw);

      // Update ticket statuses
      lottoTickets = lottoTickets.map(ticket => {
        if (ticket.drawDate === newDraw.date) {
          const [status, prizeAmount] = checkWinningStatus(ticket, newDraw);
          ticket.status = status as "won" | "lost";
          ticket.prizeAmount = prizeAmount;
        }
        return ticket;
      });

      return new Response(JSON.stringify(newDraw), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/api/draws" && method === "GET") {
      return new Response(JSON.stringify(lottoDraws), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default route
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Thai Lottery API is running on http://localhost:${server.port}`);
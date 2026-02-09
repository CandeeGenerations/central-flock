import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { peopleRouter } from './routes/people.js';
import { groupsRouter } from './routes/groups.js';
import { messagesRouter } from './routes/messages.js';
import { importRouter } from './routes/import.js';
import { contactsRouter } from './routes/contacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/people', peopleRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/import', importRouter);
app.use('/api/contacts', contactsRouter);

// In production, serve the built Vite static files
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

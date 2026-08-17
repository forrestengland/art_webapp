// pierceforrestengland.com image web server

import 'dotenv/config'; // load hidden database connection and login info immediately

import express from 'express';

import pkg from 'pg';
import busboy from 'busboy';

import crypto from 'crypto';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp'; // image processing for thumbnails

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pkg;

const app = express();
app.set('view engine', 'ejs');
const PORT = 3002;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
});

const SECRET_PASSWORD = process.env.LOGIN_SECRET_KEY;

const sessions = {};

function parseCookies(cookieHeader) {

    const cookies = {};

    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach(cookie => {
	const [name, ...rest] = cookie.split('=');
	if (name) {
	    cookies[name.trim()] = rest.join('=').trim();
	}
    });
    return cookies;
}

function parseFormData(bodyText) {
    const params = new URLSearchParams(bodyText);
    return Object.fromEntries(params.entries());
}

// check if the user is logged in, return the session id or false if they aren't logged in
function requireAuthentication(req) {

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.session_id;
    const userSession = sessions[sessionId]; // undefined if not logged in
	    
    if (!userSession) {
	return false;
    } else {
	return sessionId;
    }
}

// static resources
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));

// painting detail page
app.get('/painting', async (req, res) => {

    const id = req.query.id;
    if (!id) {
	res.send('no painting id provided');
	return;
    }

    const query = `SELECT id, title, description, image_data, mime_type FROM gallery_images WHERE id = ${id}`;
    console.log(query);
    const result = await pool.query(query);

    if (result.rows.length != 1) {
	res.send('error fetching image');
	return;
    }

    const mimeType = result.rows[0].mime_type;
    const base64Image = result.rows[0].image_data.toString('base64');
    const imageSrc = `data:${mimeType};base64,${base64Image}`;
    const title = result.rows[0].title;
    const description = result.rows[0].description || 'No description available';

    const viewData = {
	mimeType: mimeType,
	imageSrc: imageSrc,
	title: title,
	description: description
    };

    res.render('painting', viewData);
});

// gallery page
app.get('/paintings', async (req, res) => {

    const result = await pool.query('SELECT id, title, description, thumbnail_image, mime_type FROM gallery_images ORDER BY id DESC');

    const viewData = {
	paintings: result.rows
    };

    res.render('gallery', viewData);
        
});

// handle post data from the login form
app.post('/login', (req, res) => {

    let body = '';

    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {

	console.log(body);
	let formData = parseFormData(body);
	console.log(formData);
	const { password } = formData;
	console.log(password);

	if (password === SECRET_PASSWORD) {

	    const newSessionId = crypto.randomBytes(16).toString('hex');
	    sessions[newSessionId] = { username: 'admin' };

	    res.writeHead(302, {
		'Set-Cookie': `session_id=${newSessionId}; Path=/; httpOnly`,
		'Location': '/admin'
	    });
	    res.send();
	} else {
	    // invalid password
	    res.send('<h3>Invalid credentials. <a href="/login">Try again</a></h3>');
	}
    });
});

// show the login page
app.get('/login', (req, res) => {

    // check if they're logged in and redirect to the admin page if they are
    if (requireAuthentication(req)) {
	res.writeHead(303, { 'Location': '/admin' });
        res.end();
	return;
    }

    res.render('login', {});
    
});
	
// process log out request
app.get('/logout', (req, res) => {

    // Clear cookie by setting its expiration date to the past
    res.writeHead(302, {
	'Set-Cookie': 'session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
	'Location': '/login'
    });
    res.send();
});

// process image upload
app.post('/upload', (req, res) => {

    if (!requireAuthentication(req)) {
	res.writeHead(303, { 'Location': '/login' });
        res.end();
	return;
    }

    const bb = busboy({ headers: req.headers });
    const fields = {};
    let imageBuffer = Buffer.alloc(0);
    let mimeType = '';
    let isUploadAborted = false;

    // Capture regular text fields (title, description, password)
    bb.on('field', (name, val) => {
        fields[name] = val;
    });

    // Stream and combine raw file chunks into a single binary buffer
    bb.on('file', (name, file, info) => {
        mimeType = info.mimeType;
        file.on('data', (data) => {
	    if (!isUploadAborted) {
                imageBuffer = Buffer.concat([imageBuffer, data]);
	    }
        });
    });

    // Once parsing completes, insert data into PostgreSQL
    bb.on('finish', async () => {

	if (isUploadAborted) return;
	    
        try {

            if (!fields.title || imageBuffer.length === 0) {
                res.send('Missing required fields: Title and Image are mandatory.');
                return;
            }

	    // create the thumbnail
	    const thumbnailBuffer = await sharp(imageBuffer)
		  .resize({ width: 300 }) // Adjust size as needed
		  .toBuffer();


            await pool.query(
                'INSERT INTO gallery_images (title, description, image_data, mime_type, thumbnail_image) VALUES ($1, $2, $3, $4, $5)',
                [fields.title, fields.description || '', imageBuffer, mimeType, thumbnailBuffer]
            );

            // Redirect back to the gallery home screen upon success
            res.writeHead(303, { 'Location': '/admin' });
            res.end();

        } catch (err) {
            console.error("Database Save Error:", err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error while saving to database.');
        }
    });

    req.pipe(bb);
});

// image delete request
app.get('/delete', async (req, res) => {

    if (!requireAuthentication(req)) {
	res.writeHead(303, { 'Location': '/login' });
        res.end();
	return;
    }

    const id = req.query.id;
    const query = `DELETE FROM gallery_images WHERE id = ${id}`;
    console.log(query);
    const result = await pool.query(query);

    res.writeHead(302, {'Location': '/admin'});
    res.end();
});

// image info update request
app.post('/update', (req, res) => {

    if (!requireAuthentication(req)) {
	res.writeHead(303, { 'Location': '/login' });
        res.end();
	return;
    }

    let body = '';

    req.on('data', chunk => { body += chunk; });
	
    req.on('end', async () => {

	console.log(body);
	let formData = parseFormData(body);
	console.log(formData);

	const { id, title, description } = formData;

	await pool.query(
            'UPDATE gallery_images SET title = $1, description = $2 WHERE id = $3',
            [title, description || '', id]
        );

	res.writeHead(302, {'Location': '/admin'});
	res.end();
    });
});

// image delete request
app.get('/edit', async (req, res) => {

    if (!requireAuthentication(req)) {
	res.writeHead(303, { 'Location': '/login' });
        res.end();
	return;
    }

    const id = req.query.id;

    const query = `SELECT id, title, description, thumbnail_image, mime_type FROM gallery_images WHERE id = ${id}`;
    console.log(query);
    const result = await pool.query(query);

    const image = result.rows.map(row => {

	const base64Image = row.thumbnail_image.toString('base64');
	const imageSrc = `data:${row.mime_type};base64,${base64Image}`;

	const viewData = {
	    imageSrc: imageSrc,
	    id: row.id,
	    title: row.title,
	    description: row.description
	};

	res.render('painting_edit', viewData);
	
    });
});
	
app.get('/admin', async (req, res) => {

    if (!requireAuthentication(req)) {
	res.writeHead(303, { 'Location': '/login' });
        res.end();
	return;
    }

    // display upload form and gallery
    try {
	
        const result = await pool.query('SELECT id, title, description, thumbnail_image, mime_type FROM gallery_images ORDER BY id DESC');

	const viewData = {
	    paintings: result.rows
	};
	
	res.render('gallery_admin', viewData);
            
    } catch (err) {

        console.error("Server display rendering error:", err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');

    }
});

// default page output - home
app.get('/', (req, res) => {

    res.render('home', {});

});

app.listen(PORT, () => console.log(`art_webapp server running at port ${PORT}`));

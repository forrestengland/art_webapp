// pierceforrestengland.com image web server

import http from 'http';
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

const PORT = 3002;

const pool = new Pool({
    user: 'myuser',
    host: 'localhost',
    database: 'mydb',
    password: 'mysecurepassword',
    port: 5432,
});

const SECRET_PASSWORD = "mysecretadminpwd";

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

function htmlHead() {
        const htmlOutput = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Pierce Forrest England</title>
                <link rel="stylesheet" href="/styles/pfe.css">
            </head>
            <body>
        `;
    return htmlOutput;
}

function htmlFoot() {
            const htmlOutput = `

                </div>
            </body>
            </html>
`;
    return htmlOutput;

}

const server = http.createServer(async (req, res) => {

    const fullUrl = new URL(req.url, `https://${req.headers.host}`);
    const pathname = fullUrl.pathname;

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.session_id;
    const userSession = sessions[sessionId]; // undefined if not logged in

    // static image serving for main page
    if (req.url.startsWith('/images/')) {

	const safeUrl = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
	const filePath = path.join(__dirname, safeUrl);

	fs.readFile(filePath, (err, data) => {
	    if (err) {
		res.writeHead(404, {'Content-Type':''});
		return res.end('Image not found');
	    }

	    const ext = path.extname(filePath).toLowerCase();
	    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

	    res.writeHead(200, {'Content-Type': mimeType});
	    res.end(data);
	});

    } else if (req.url.startsWith('/styles/')) { // static css serving

	const safeUrl = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
	const filePath = path.join(__dirname, safeUrl);

	fs.readFile(filePath, (err, data) => {
	    if (err) {
		res.writeHead(404, {'Content-Type':''});
		return res.end('stylesheet not found');
	    }

	    res.writeHead(200, {'Content-Type': 'text/css'});
	    res.end(data);
	});
	
	
    } else if (pathname === '/painting') { // view an individual painting

	const id = fullUrl.searchParams.get('id');

	const query = `SELECT id, title, description, image_data, mime_type FROM gallery_images WHERE id = ${id}`;
	console.log(query);
	const result = await pool.query(query);
        
        const image = result.rows.map(row => {

	    const base64Image = row.image_data.toString('base64');
	    const imageSrc = `data:${row.mime_type};base64,${base64Image}`;

	    return `
                <div class="image-full">
                    <h1>${row.title}</h1>
                    <img width="800px" src="${imageSrc}" alt="${row.title}" />
                    <p>${row.description || 'No description available.'}</p>
                </div>
            `;
	}).join('');

	let htmlOutput = htmlHead();
	htmlOutput += `

                <div class="gallery">
`;
	htmlOutput += image;
	htmlOutput += htmlFoot();
	res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlOutput);

    
    } else if (pathname === '/paintings') { // view painting gallery with thumbnails

        const result = await pool.query('SELECT id, title, description, thumbnail_image, mime_type FROM gallery_images ORDER BY id DESC');
        
        const imageCards = result.rows.map(row => {

	    const base64Image = row.thumbnail_image.toString('base64');
	    const imageSrc = `data:${row.mime_type};base64,${base64Image}`;

	    return `
                <div class="card">
                    <a href="/painting?id=${row.id}">
                    <img src="${imageSrc}" alt="${row.title}" />
                    <div class="card-body">
                        <h3>${row.title}</h3>
                        <!--<p>${row.description || 'No description available.'}</p>-->
                    </div>
                    </a>
                </div>
            `;
        }).join('');

	let htmlOutput = htmlHead();
	htmlOutput += `

                <h1>Paintings</h1>
                
                <div class="gallery">
`;
	htmlOutput += imageCards;
	htmlOutput += htmlFoot();
	res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlOutput);

    } else if (req.url === '/login') {

	// password submission
	if (req.method === 'POST') {

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
		    return res.end();
		} else {

		    // invalid password
		    res.writeHead(401, {'Content-Type': 'text/html'});
		    return res.end('<h3>Invalid credentials. <a href="/login">Try again</a></h3>');
		}
	    });
	    return;
	    
	} else if (req.method === 'GET') { // view login page
	    
	    // if already logged in proceed to main admin page
	    if (userSession) {
		res.writeHead(302, {'Location': '/admin'});
		return res.end();
	    }

            let htmlOutput = htmlHead() + `
                
                <div class="form-container">
                    <h2>Login</h2>
                    <form action="/login" method="POST" enctype="multipart/x-www-form-urlencoded">
                        <div class="form-group">
                            <label for="password">Password:</label>
                            <input type="password" id="password" name="password" required placeholder="Enter secret password" />
                        </div>
                        <button type="submit" class="submit-btn">Submit</button>
                    </form>
                </div>
`+htmlFoot();
            res.end(htmlOutput);	    
	}
	
    // process log out request
    } else if (req.method === 'GET' && req.url === '/logout') {

	if (sessionId) {
	    delete sessions[sessionId];
	}

	// Clear cookie by setting its expiration date to the past
	res.writeHead(302, {
	    'Set-Cookie': 'session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
	    'Location': '/login'
	});
	return res.end();

    // process image upload
    } else if (req.method === 'POST' && req.url === '/upload') {

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
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Missing required fields: Title and Image are mandatory.');
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
        return;

    } else if (pathname === '/delete' && req.method === 'GET') { // image delete request

	// if session doesn't exist redirect to login page
	if (!userSession) {
	    res.writeHead(302, {'Location': '/login'});
	    return res.end();
	}

	const id = fullUrl.searchParams.get('id');
	const query = `DELETE FROM gallery_images WHERE id = ${id}`;
	console.log(query);
	const result = await pool.query(query);

	res.writeHead(302, {'Location': '/admin'});
	return res.end();

    } else if (pathname === '/update' && req.method === 'POST') { // image info update request

	// if session doesn't exist redirect to login page
	if (!userSession) {
	    res.writeHead(302, {'Location': '/login'});
	    return res.end();
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
	    return res.end();

	});
	return;	

    } else if (pathname === '/edit' && req.method === 'GET') { // image delete request

	// if session doesn't exist redirect to login page
	if (!userSession) {
	    res.writeHead(302, {'Location': '/login'});
	    return res.end();
	}

	const id = fullUrl.searchParams.get('id');

	const query = `SELECT id, title, description, thumbnail_image, mime_type FROM gallery_images WHERE id = ${id}`;
	console.log(query);
	const result = await pool.query(query);

	const image = result.rows.map(row => {

	    const base64Image = row.thumbnail_image.toString('base64');
	    const imageSrc = `data:${row.mime_type};base64,${base64Image}`;

	    return `
                <!-- New Image Upload Form Interface Element -->
                <div class="form-container">
                    <h2>Edit Image</h2>
                    <form action="/update" method="POST" enctype="multipart/x-www-form-urlencoded">
                        <input type="hidden" name="id" value="${row.id}">
                        <div class="form-group">
                            <label for="title">Image Title</label>
                            <input type="text" id="title" name="title" value="${row.title}" />
                        </div>
                        <div class="form-group">
                            <label for="description">Description</label>
                            <textarea id="description" name="description" rows="3">${row.description}</textarea>
                        </div>
<!--                        <div class="form-group">
                            <label for="image">Choose Image File *</label>
                            <input type="file" id="image" name="image" accept="image/*" required />
                        </div> -->
                        <button type="submit" class="submit-btn">Update</button>
                    </form>
                </div>

                <img src="${imageSrc}" alt="${row.title}" />
            `;
	}).join('');

	let htmlOutput = htmlHead();
	htmlOutput += `

                <div class="gallery">
`;
	htmlOutput += image;
	htmlOutput += htmlFoot();
	res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlOutput);
	
    } else if (pathname === '/admin' && req.method === 'GET') {

	// if session doesn't exist redirect to login page
	if (!userSession) {
	    res.writeHead(302, {'Location': '/login'});
	    return res.end();
	}

	// display upload form and gallery
	try {
            const result = await pool.query('SELECT id, title, description, thumbnail_image, mime_type FROM gallery_images ORDER BY id DESC');
            
            const imageCards = result.rows.map(row => {
		const base64Image = row.thumbnail_image.toString('base64');
		const imageSrc = `data:${row.mime_type};base64,${base64Image}`;

		return `
                <div class="card">
                    <img src="${imageSrc}" alt="${row.title}" />
                    <div class="card-body">
                        <h3>${row.title}</h3>
                        <p>${row.description || 'No description available.'}</p>
                        <a href="/edit?id=${row.id}">edit</a>
                        <a href="/delete?id=${row.id}">delete</a>
                    </div>
                </div>
            `;
            }).join('');

            let htmlOutput = htmlHead() + `
                
                <!-- New Image Upload Form Interface Element -->
                <div class="form-container">
                    <h2>Upload New Image</h2>
                    <form action="/upload" method="POST" enctype="multipart/form-data">
                        <div class="form-group">
                            <label for="title">Image Title</label>
                            <input type="text" id="title" name="title" required placeholder="Enter an image title" />
                        </div>
                        <div class="form-group">
                            <label for="description">Description</label>
                            <textarea id="description" name="description" rows="3" placeholder="Enter optional details..."></textarea>
                        </div>
                        <div class="form-group">
                            <label for="image">Choose Image File *</label>
                            <input type="file" id="image" name="image" accept="image/*" required />
                        </div>
<div class="form-group">
<!--                            <label for="password">Upload Secret Password *</label>
                            <input type="password" id="password" name="password" required placeholder="Enter secret password to verify upload" /> -->
                        </div>
                        <button type="submit" class="submit-btn">Upload to Database</button>
                        <a href="/logout">Log Out</a>
                    </form>
                </div>

                <div class="gallery">
                    ${imageCards || '<p style="text-align:center; width:100%;">No images found in the database directory.</p>'}
                </div>` + htmlFoot();

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlOutput);

	} catch (err) {
            console.error("Server display rendering error:", err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
	}

    } else { // default page output - home

	let htmlOutput = htmlHead();
	htmlOutput += `
                <h1>Pierce Forrest England</h1>
                
                <div class="gallery">

                    <div class="card">
                    <a href="/paintings">
                    <img src="/images/lenny.jpg" alt="Dog Painting" />
                    <div class="card-body">
                        <h3>Paintings</h3>
                        <p>recent oil paintings</p>
                    </div>
                    </a>
                </div>
`;
	htmlOutput += htmlFoot();

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlOutput);
    }
});

server.listen(PORT, () => {
    console.log(`pierceforrestengland server running securely at port ${PORT}`);
});

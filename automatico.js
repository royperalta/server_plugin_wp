const axios = require('axios');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
require('dotenv').config();

// Configuración
const WORDPRESS_API_URL = 'https://radioondapopular.com/wp-json/wp/v2/posts';
const CATEGORY_ID = 38;
const INTERVAL_MINUTES = 45;
const LOG_FILE = 'published_posts.json';

// Configuración de Facebook desde variables de entorno
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const PUBLISH_TO_STORY = false;

// Configuración de imagen (similar a tu plugin)
const IMAGE_CONFIG = {
    width: 720,
    height: 1280,
    logoUrl: 'https://radioondapopular.com/wp-content/uploads/2025/05/310215910_216836080672628_4931544917441388216_n-1.png',
    categoryBgColor: '#1a73e8',
    categoryTextColor: '#ffffff',
    fontFamily: "'Poppins', sans-serif",
    titleFontSize: '46px',
    categoryFontSize: '32px'
};

// Directorio para imágenes temporales
const OUTPUT_DIR = './output';
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// Cargar o inicializar el registro de posts publicados
let publishedPosts = [];
if (fs.existsSync(LOG_FILE)) {
    publishedPosts = JSON.parse(fs.readFileSync(LOG_FILE));
}

// Función mejorada para obtener imagen destacada
async function getFeaturedImageUrl(post) {
    try {
        // 1. Primero intentamos con featured_media_url si existe
        if (post.featured_media_url && !post.featured_media_url.includes('default')) {
            return post.featured_media_url.replace('-150x150', '');
        }

        // 2. Buscar en el contenido HTML
        const imageMatch = post.content.rendered.match(/src="([^"]*)"/i);
        if (imageMatch && imageMatch[1]) {
            return imageMatch[1];
        }

        // 3. Usar imagen por defecto
        console.log('Usando imagen por defecto');
        return IMAGE_CONFIG.logoUrl;
    } catch (error) {
        console.error('Error al obtener imagen:', error.message);
        return IMAGE_CONFIG.logoUrl;
    }
}

// Función para obtener las últimas noticias
async function fetchLatestNews() {
    try {
        const response = await axios.get(WORDPRESS_API_URL, {
            params: {
                categories: CATEGORY_ID,
                per_page: 10,
                _fields: 'id,title,content,link,featured_media_url,categories'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error al obtener noticias:', error.message);
        return [];
    }
}

// Función para generar la imagen (similar a tu plugin)
async function generateImage(post) {
    const imageUrl = await getFeaturedImageUrl(post);
    const category = 'MUNDO'; // Puedes personalizar esto según las categorías del post

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: IMAGE_CONFIG.width, height: IMAGE_CONFIG.height });

 await page.setContent(`
    <html>
        <head>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
            <style>
                body {
                    margin: 0;
                    height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: linear-gradient(135deg, #000428 0%, #004e92 100%);
                    overflow: hidden;
                    font-family: 'Montserrat', sans-serif;
                }
                .container {
                    position: relative;
                    width: ${IMAGE_CONFIG.width}px;
                    height: ${IMAGE_CONFIG.height}px;
                    overflow: hidden;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                .background-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(to bottom, 
                        rgba(0,0,0,0) 0%, 
                        rgba(0,0,0,0.3) 50%,
                        rgba(0,0,0,0.7) 80%);
                    z-index: 1;
                }
                .featured-image {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    z-index: 0;
                    transform: scale(1.05);
                    filter: brightness(0.9) contrast(1.1);
                }
                .content {
                    position: relative;
                    z-index: 2;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-end;
                    padding: 30px;
                    padding-bottom: 210px; /* Ajuste clave para posición óptima en FB */
                    box-sizing: border-box;
                }
                .title {
                    color: white;
                    font-size: 48px; /* Tamaño optimizado para móviles */
                    font-weight: 800;
                    line-height: 1.15;
                    margin-bottom: 25px;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.7);
                    font-family: 'Playfair Display', serif;
                    position: relative;
                    max-width: 90%; /* Evita que toque los bordes */
                }
                .title::after {
                    content: "";
                    display: block;
                    width: 80px;
                    height: 4px;
                    background: #FFD700;
                    margin: 18px 0;
                }
                .category-badge {
                    background: #FFD700;
                    color: #000;
                    padding: 10px 20px;
                    font-size: 20px;
                    font-weight: 800;
                    border-radius: 30px;
                    display: inline-block;
                    margin-bottom: 25px;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    align-self: flex-start;
                }
                .logo-container {
                    position: absolute;
                    top: 25px;
                    left: 25px;
                    z-index: 3;
                }
                .logo {
                    height: 55px;
                    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5));
                }
                .viral-element {
                    position: absolute;
                    top: 60%; /* Ajustado para coincidir con la zona de texto */
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, 
                        rgba(255,215,0,0.15) 0%, 
                        transparent 70%);
                    z-index: 1;
                    animation: pulse 8s infinite alternate;
                }
                @keyframes pulse {
                    0% { transform: translate(-50%, -50%) scale(1); opacity: 0.1; }
                    100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.25; }
                }
                .corner-decoration {
                    position: absolute;
                    width: 120px;
                    height: 120px;
                    border: 3px solid #FFD700;
                    z-index: 2;
                }
                .corner-tl {
                    top: -8px;
                    left: -8px;
                    border-right: none;
                    border-bottom: none;
                }
                .corner-br {
                    bottom: -8px;
                    right: -8px;
                    border-left: none;
                    border-top: none;
                }
                /* Asegurar visibilidad en dispositivos pequeños */
                @media (max-height: 700px) {
                    .content {
                        padding-bottom: 80px;
                    }
                    .title {
                        font-size: 42px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="viral-element"></div>
                
                <img class="featured-image" src="${imageUrl}" alt="Featured Image">
                <div class="background-overlay"></div>
                
                <div class="logo-container">
                    <img class="logo" src="${IMAGE_CONFIG.logoUrl}" alt="Logo">
                </div>
                
                <div class="corner-decoration corner-tl"></div>
                <div class="corner-decoration corner-br"></div>
                
                <div class="content">
                    <div class="category-badge">${category}</div>
                    <h1 class="title">${post.title.rendered}</h1>
                </div>
            </div>
        </body>
    </html>
`);

    const imageBuffer = await page.screenshot();
    await browser.close();

    const uniqueId = uuidv4();
    const outputPath = path.join(OUTPUT_DIR, `image_${uniqueId}.png`);
    fs.writeFileSync(outputPath, imageBuffer);

    return { imagePath: outputPath, post };
}

// Función para publicar en Facebook (similar a tu plugin)
async function postToFacebook(imagePath, title, postUrl) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath));
        formData.append('message', title);

        const response = await axios.post(
            `https://graph.facebook.com/v12.0/${FACEBOOK_PAGE_ID}/photos?access_token=${FACEBOOK_ACCESS_TOKEN}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                },
            }
        );

        console.log('Imagen publicada en Facebook:', response.data);
        const postId = response.data.id;

        // Agregar comentario con el enlace
        await axios.post(
            `https://graph.facebook.com/v12.0/${postId}/comments?access_token=${FACEBOOK_ACCESS_TOKEN}`,
            { message: `Más información: ${postUrl}` }
        );

        // Publicar en historia si está habilitado
        if (PUBLISH_TO_STORY) {
            await postToFacebookStory(imagePath, title, postUrl);
        }

        return true;
    } catch (error) {
        console.error('Error al publicar en Facebook:', error.response?.data || error.message);
        return false;
    }
}

async function postToFacebookStory(imagePath, title, postUrl) {
    try {
        // 1. Subir la foto primero
        const photoId = await uploadPhoto(imagePath);
        
        // 2. Publicar la historia
        const response = await axios.post(
            `https://graph.facebook.com/v12.0/${FACEBOOK_PAGE_ID}/photo_stories?access_token=${FACEBOOK_ACCESS_TOKEN}`,
            {
                photo_id: photoId,
                message: `${title}\n\n${postUrl}`,
                link: postUrl
            }
        );

        console.log('Historia publicada en Facebook:', response.data);
        return true;
    } catch (error) {
        console.error('Error al publicar historia:', error.response?.data || error.message);
        return false;
    }
}

async function uploadPhoto(imagePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath));
        formData.append('published', 'false');

        const response = await axios.post(
            `https://graph.facebook.com/v12.0/${FACEBOOK_PAGE_ID}/photos?access_token=${FACEBOOK_ACCESS_TOKEN}`,
            formData,
            { headers: formData.getHeaders() }
        );

        return response.data.id;
    } catch (error) {
        console.error('Error al subir foto:', error.response?.data || error.message);
        throw error;
    }
}

// Función principal
async function publishNextNews() {
    try {
        console.log('Buscando nuevas noticias...');
        const news = await fetchLatestNews();
        
        // Encontrar la primera noticia no publicada
        const unpublishedPost = news.find(post => !publishedPosts.includes(post.id));
        
        if (unpublishedPost) {
            console.log(`Publicando noticia: ${unpublishedPost.title.rendered}`);
            
            // 1. Generar la imagen
            const { imagePath, post } = await generateImage(unpublishedPost);
            
            // 2. Publicar en Facebook
            const success = await postToFacebook(
                imagePath,
                unpublishedPost.title.rendered,
                unpublishedPost.link
            );
            
            if (success) {
                // Registrar el post publicado
                publishedPosts.push(unpublishedPost.id);
                fs.writeFileSync(LOG_FILE, JSON.stringify(publishedPosts, null, 2));
                console.log('Noticia publicada exitosamente');
            }
            
            // Eliminar la imagen temporal
            fs.unlinkSync(imagePath);
        } else {
            console.log('No hay nuevas noticias para publicar.');
        }
    } catch (error) {
        console.error('Error en el proceso de publicación:', error.message);
    }
}

// Iniciar el intervalo
console.log(`Iniciando publicación automática cada ${INTERVAL_MINUTES} minutos...`);
publishNextNews(); // Ejecutar inmediatamente al inicio
setInterval(publishNextNews, INTERVAL_MINUTES * 60 * 1000);
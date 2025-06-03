const axios = require('axios');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
require('dotenv').config();

// Configuración
const WORDPRESS_API_URL = 'https://radioondapopular.com/wp-json/wp/v2/posts';
const CATEGORY_ID = 37;
const INTERVAL_MINUTES = 55;
const LOG_FILE = 'published_posts.json';

// Configuración de Facebook desde variables de entorno
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID_ONDAPOPULAR;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN_ONDAPOPULAR;
const PUBLISH_TO_STORY = false;

// Configuración de imagen (similar a tu plugin)
const IMAGE_CONFIG = {
    width: 720,
    height: 1280,
    logoUrl: 'https://radioondapopular.com/wp-content/uploads/2025/05/cropped-onda-popular-logo.png',
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
    const category = 'NACIONAL'; // Puedes personalizar esto según las categorías del post

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: IMAGE_CONFIG.width, height: IMAGE_CONFIG.height });

   await page.setContent(`
        <html>
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&display=swap" rel="stylesheet">
                <style>
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        background-color: #ff0000; /* Fondo rojo */
                        font-family: ${IMAGE_CONFIG.fontFamily};
                        margin: 0;
                        height: 100vh;
                    }
                    .container {
                        position: relative;
                        width: ${IMAGE_CONFIG.width}px;
                        height: ${IMAGE_CONFIG.height}px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    .background {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-image: url('${imageUrl}');
                        background-size: cover;
                        filter: blur(10px);
                        z-index: 1;
                    }
                    .image {
                        width: 95%;
                        max-height: 80%;
                        z-index: 2;
                        margin-top: 10px;
                        border: 3px solid white; /* Borde blanco para la imagen */
                    }
                    .logo {
                        position: absolute;
                        bottom: 20%;
                        left: 10px;
                        width: 100px;
                        border-radius: 5px;
                        z-index: 2;
                        border: 2px solid white; /* Borde blanco para el logo */
                    }
                    .title { 
                        margin-top: 5px;
                        background: rgba(255, 0, 0, 0.8); /* Fondo rojo semitransparente */
                        color: white; /* Texto blanco */
                        padding: 8px;
                        font-size: ${IMAGE_CONFIG.titleFontSize};
                        font-weight: 800;
                        text-align: center;
                        border-radius: 5px;
                        position: relative;
                        z-index: 2;
                        line-height: 1.2;
                        text-shadow: 1px 1px 2px black; /* Sombra para mejor legibilidad */
                        border: 1px solid white; /* Borde blanco */
                    }
                    .category {
                        margin-top: 15px;
                        background: #8B0000; /* Rojo oscuro */
                        color: white; /* Texto blanco */
                        padding: 6px;
                        font-size: ${IMAGE_CONFIG.categoryFontSize};
                        font-weight: 500;
                        text-align: left;
                        border-radius: 5px;
                        position: relative;                            
                        z-index: 2;
                        border: 1px solid white; /* Borde blanco */
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="background"></div>
                    <div class="title">${post.title.rendered}</div>
                    <img class="image" src="${imageUrl}" alt="Imagen destacada" />
                    <img class="logo" src="${IMAGE_CONFIG.logoUrl}" alt="Logo" />
                    <div class="category">${category}</div>
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
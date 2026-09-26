<?php
/**
 * Badrockplyr PRO - ToroFlix Theme Integration Hook & Preset
 * 
 * ============================================================================
 * GUÍA DE INSTALACIÓN RÁPIDA PARA TOROFLIX (ToroThemes)
 * ============================================================================
 * 
 * 1. Copia este archivo dentro de la carpeta de tu tema o tema hijo:
 *    wp-content/themes/toroflix/inc/badrock-toroflix.php
 *    O en tu carpeta mu-plugins:
 *    wp-content/mu-plugins/badrock-toroflix.php
 * 
 * 2. En el archivo `functions.php` de tu tema ToroFlix, incluye el archivo:
 *    require_once get_stylesheet_directory() . '/badrock-toroflix.php';
 * 
 * 3. Define tus credenciales de Badrockplyr abajo o en wp-config.php:
 *    define('BADROCK_API_URL', 'https://tu-servidor-badrock.com');
 *    define('BADROCK_API_KEY', 'bdrk_live_xxxxxxxxxxxxxxxx');
 * 
 * ToroFlix almacena sus opciones de reproducción en campos personalizados como
 * `links`, `_links`, `toroflix_player` o `repeatable_fields`. Este script
 * intercepta el guardado e importación de películas y episodios, consulta
 * Badrockplyr PRO y mapea todos los servidores disponibles (incluyendo
 * el Servidor VIP de Google Drive / Wasabi y los streams HLS/MP4).
 * 
 * @package   Badrockplyr PRO
 * @version   2.0.0
 * @author    Badrockplyr Team
 */

if (!defined('ABSPATH')) {
    exit;
}

// Configuración por defecto
if (!defined('BADROCK_API_URL')) {
    define('BADROCK_API_URL', get_option('badrock_api_url', 'http://localhost:3000'));
}
if (!defined('BADROCK_API_KEY')) {
    define('BADROCK_API_KEY', get_option('badrock_api_key', ''));
}
if (!defined('BADROCK_OVERRIDE_TOROFLIX_PLAYER')) {
    // Si es true, reemplaza el iframe nativo de ToroFlix con el reproductor cinema de Badrock
    define('BADROCK_OVERRIDE_TOROFLIX_PLAYER', false);
}

/**
 * ============================================================================
 * 1. HOOK AUTOMÁTICO EN GUARDADO DE PELÍCULAS Y EPISODIOS EN TOROFLIX
 * ============================================================================
 */
add_action('save_post', 'badrock_toroflix_save_post_handler', 20, 2);

function badrock_toroflix_save_post_handler($post_id, $post) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (wp_is_post_revision($post_id)) return;
    if (!$post || ($post->post_status !== 'publish' && $post->post_status !== 'draft')) return;

    $post_type = $post->post_type;
    $valid_movie_types = array('movies', 'pelicula', 'post');
    $valid_episode_types = array('episodes', 'episodio', 'episode');

    $is_movie = in_array($post_type, $valid_movie_types, true);
    $is_episode = in_array($post_type, $valid_episode_types, true);

    if (!$is_movie && !$is_episode) {
        return;
    }

    if (did_action('badrock_toroflix_processed_' . $post_id)) return;
    do_action('badrock_toroflix_processed_' . $post_id);

    // Obtener TMDb ID o IMDb ID desde los campos nativos de ToroFlix
    $tmdb_id = get_post_meta($post_id, 'id_tmdb', true);
    if (empty($tmdb_id)) $tmdb_id = get_post_meta($post_id, 'tmdb', true);
    if (empty($tmdb_id)) $tmdb_id = get_post_meta($post_id, '_tmdb_id', true);
    if (empty($tmdb_id)) $tmdb_id = get_post_meta($post_id, 'id', true);

    $imdb_id = get_post_meta($post_id, 'id_imdb', true);
    if (empty($imdb_id)) $imdb_id = get_post_meta($post_id, 'imdb', true);
    if (empty($imdb_id)) $imdb_id = get_post_meta($post_id, '_imdb_id', true);

    if (empty($tmdb_id) && empty($imdb_id)) {
        return;
    }

    $lookup_id = !empty($tmdb_id) ? $tmdb_id : $imdb_id;
    $type = $is_episode ? 'tv' : 'movie';
    $season = 1;
    $episode = 1;

    if ($is_episode) {
        $season = intval(get_post_meta($post_id, 'temporada', true));
        if ($season <= 0) $season = intval(get_post_meta($post_id, '_season', true));
        if ($season <= 0) $season = 1;

        $episode = intval(get_post_meta($post_id, 'episodio', true));
        if ($episode <= 0) $episode = intval(get_post_meta($post_id, '_episode', true));
        if ($episode <= 0) $episode = 1;
    }

    // Consultar Badrock REST API
    $api_url = rtrim(BADROCK_API_URL, '/');
    $api_key = BADROCK_API_KEY;

    $endpoint = $api_url . '/api/v1/media/' . urlencode($lookup_id) . '?type=' . urlencode($type);
    if ($type === 'tv') {
        $endpoint .= '&season=' . $season . '&episode=' . $episode;
    }

    $response = wp_remote_get($endpoint, array(
        'timeout' => 20,
        'headers' => array(
            'X-Badrock-Key' => $api_key,
            'Accept'        => 'application/json'
        )
    ));

    if (is_wp_error($response)) {
        error_log('[Badrock-ToroFlix] Error al consultar API: ' . $response->get_error_message());
        return;
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if (!isset($data['success']) || !$data['success'] || empty($data['data'])) {
        return;
    }

    $media_data = $data['data'];
    $servers = isset($media_data['servers']) && is_array($media_data['servers']) ? $media_data['servers'] : array();
    $embed_url = isset($media_data['embedPlayerUrl']) ? $media_data['embedPlayerUrl'] : '';

    // =========================================================================
    // 2. MAPEO A CAMPOS PERSONALIZADOS DE TOROFLIX
    // =========================================================================
    // ToroFlix almacena comúnmente los reproductores en `links`, `_links` o `toroflix_player`
    $toroflix_links = array();

    // 1. Embed Cinema Badrock
    if (!empty($embed_url)) {
        $toroflix_links[] = array(
            'titulo'   => '⚡ Badrock Cinema (Multi-Audio)',
            'nombre'   => 'Badrock Cinema',
            'server'   => 'Badrock Cinema',
            'idioma'   => 'Latino / Multi',
            'calidad'  => '1080p',
            'tipo'     => 'iframe',
            'url'      => esc_url_raw($embed_url)
        );
    }

    // 2. Servidores desofuscados y Servidor VIP
    foreach ($servers as $srv) {
        $name    = isset($srv['name']) ? $srv['name'] : 'Servidor';
        $is_vip  = !empty($srv['isVip']);
        $lang    = isset($srv['language']) ? $srv['language'] : 'Latino';
        $quality = isset($srv['quality']) ? $srv['quality'] : '1080p';
        $url     = isset($srv['url']) ? $srv['url'] : '';

        if (empty($url)) continue;

        $toroflix_links[] = array(
            'titulo'   => ($is_vip ? '⭐ Servidor VIP' : '▶ ' . $name) . ' (' . $quality . ')',
            'nombre'   => $is_vip ? 'VIP Drive/Proxy' : $name,
            'server'   => $is_vip ? 'VIP Server' : $name,
            'idioma'   => ucfirst(strtolower($lang)),
            'calidad'  => $quality,
            'tipo'     => 'iframe',
            'url'      => esc_url_raw($url)
        );
    }

    // Guardar en las estructuras típicas de ToroFlix
    update_post_meta($post_id, 'links', $toroflix_links);
    update_post_meta($post_id, '_links', $toroflix_links);
    update_post_meta($post_id, 'repeatable_fields', $toroflix_links);
    update_post_meta($post_id, '_badrock_embed_url', esc_url_raw($embed_url));
    update_post_meta($post_id, '_badrock_toroflix_synced', current_time('mysql'));
}

/**
 * ============================================================================
 * 3. METABOX EN EL EDITOR DE TOROFLIX (1-CLICK SYNC)
 * ============================================================================
 */
add_action('add_meta_boxes', 'badrock_toroflix_register_metabox');
function badrock_toroflix_register_metabox() {
    $screens = array('post', 'movies', 'pelicula', 'episodes', 'episodio');
    foreach ($screens as $screen) {
        if (post_type_exists($screen)) {
            add_meta_box(
                'badrock_toroflix_box',
                '⚡ Badrockplyr PRO - ToroFlix Sync',
                'badrock_toroflix_render_metabox',
                $screen,
                'side',
                'high'
            );
        }
    }
}

function badrock_toroflix_render_metabox($post) {
    $synced = get_post_meta($post->ID, '_badrock_toroflix_synced', true);
    $embed_url = get_post_meta($post->ID, '_badrock_embed_url', true);
    ?>
    <div style="font-size: 12px; line-height: 1.5;">
        <p style="margin: 0 0 8px; color: #475569;">
            Inyecta automáticamente los enlaces directos y el Servidor VIP en las pestañas de ToroFlix:
        </p>

        <?php if (!empty($synced)): ?>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px;">
                ✓ Streams sincronizados.<br>
                <span style="font-size: 10px; opacity: 0.8;"><?php echo esc_html($synced); ?></span>
            </div>
        <?php endif; ?>

        <button type="button" id="badrock-toroflix-sync-btn" class="button button-primary" style="width: 100%; text-align: center; justify-content: center; font-weight: 700;">
            🔄 Sincronizar con Badrock
        </button>
        <span id="badrock-toroflix-status" style="display: block; margin-top: 6px; font-weight: 600; font-size: 11px;"></span>

        <?php if (!empty($embed_url)): ?>
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
                <a href="<?php echo esc_url($embed_url); ?>" target="_blank" style="color: #0284c7; text-decoration: none; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                    👁 Probar Reproductor Embed Badrock &rarr;
                </a>
            </div>
        <?php endif; ?>
    </div>

    <script>
    jQuery(document).ready(function($) {
        $('#badrock-toroflix-sync-btn').on('click', function() {
            const btn = $(this);
            const status = $('#badrock-toroflix-status');
            btn.prop('disabled', true).text('Consultando Badrock...');
            status.html('<span style="color: #0284c7;">Importando servidores...</span>');

            $.post(ajaxurl, {
                action: 'badrock_toroflix_manual_sync',
                post_id: <?php echo $post->ID; ?>,
                nonce: '<?php echo wp_create_nonce("badrock_toro_nonce"); ?>'
            }, function(res) {
                btn.prop('disabled', false).text('🔄 Sincronizar con Badrock');
                if (res.success) {
                    status.html('<span style="color: #16a34a;">✓ Completado. Recargando...</span>');
                    setTimeout(() => window.location.reload(), 1200);
                } else {
                    status.html('<span style="color: #dc2626;">✗ ' + (res.data || 'Error') + '</span>');
                }
            }).fail(function() {
                btn.prop('disabled', false).text('🔄 Sincronizar con Badrock');
                status.html('<span style="color: #dc2626;">✗ Error de conexión</span>');
            });
        });
    });
    </script>
    <?php
}

add_action('wp_ajax_badrock_toroflix_manual_sync', 'badrock_toroflix_manual_sync_handler');
function badrock_toroflix_manual_sync_handler() {
    check_ajax_referer('badrock_toro_nonce', 'nonce');
    $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
    if (!$post_id || !current_user_can('edit_post', $post_id)) {
        wp_send_json_error('Permisos insuficientes.');
    }

    $post = get_post($post_id);
    if (!$post) {
        wp_send_json_error('Post no encontrado.');
    }

    badrock_toroflix_save_post_handler($post_id, $post);
    wp_send_json_success('Servidores sincronizados con éxito en ToroFlix.');
}

/**
 * ============================================================================
 * 4. SHORTCODE COMPLEMENTARIO: [badrock_toroflix_player]
 * ============================================================================
 */
add_shortcode('badrock_toroflix_player', 'badrock_toroflix_player_shortcode');
function badrock_toroflix_player_shortcode($atts) {
    global $post;
    if (!$post) return '';

    $embed_url = get_post_meta($post->ID, '_badrock_embed_url', true);
    if (empty($embed_url)) return '<!-- Badrock: No player URL assigned -->';

    return '<div class="badrock-toroflix-embed-wrapper" style="position: relative; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); background: #000; margin: 20px 0;">
        <iframe src="' . esc_url($embed_url) . '" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>
    </div>';
}

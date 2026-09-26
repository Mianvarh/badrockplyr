<?php
/**
 * Badrockplyr PRO - DooPlay Theme Integration Hook & Preset
 * 
 * ============================================================================
 * GUÍA DE INSTALACIÓN RÁPIDA PARA DOOPLAY (2.x / 3.x / dbmovies)
 * ============================================================================
 * 
 * 1. Copia este archivo dentro de la carpeta de tu tema:
 *    wp-content/themes/dooplay/inc/badrock-integration.php
 *    O en tu tema hijo (Child Theme):
 *    wp-content/themes/dooplay-child/badrock-integration.php
 * 
 * 2. En el archivo `functions.php` de tu tema DooPlay, añade al final:
 *    require_once get_stylesheet_directory() . '/badrock-integration.php';
 * 
 * 3. Define tus credenciales de Badrockplyr abajo o en wp-config.php:
 *    define('BADROCK_API_URL', 'https://tu-servidor-badrock.com');
 *    define('BADROCK_API_KEY', 'bdrk_live_xxxxxxxxxxxxxxxx');
 * 
 * Al importar películas o series mediante "dbmovies" o guardar una entrada,
 * Badrockplyr consultará automáticamente los streams desofuscados y rellenará
 * el campo nativo `repeatable_fields` de DooPlay para que aparezcan en las
 * pestañas de servidores del reproductor de DooPlay.
 * 
 * @package   Badrockplyr PRO
 * @version   2.0.0
 * @author    Badrockplyr Team
 */

if (!defined('ABSPATH')) {
    exit;
}

// Configuración por defecto (Puedes sobrescribirlas en wp-config.php)
if (!defined('BADROCK_API_URL')) {
    define('BADROCK_API_URL', get_option('badrock_api_url', 'http://localhost:3000'));
}
if (!defined('BADROCK_API_KEY')) {
    define('BADROCK_API_KEY', get_option('badrock_api_key', ''));
}
if (!defined('BADROCK_PREPEND_PLAYERS')) {
    // Si es true, los servidores Badrock (incluido VIP) se colocan primero en la lista de pestañas
    define('BADROCK_PREPEND_PLAYERS', true);
}

/**
 * ============================================================================
 * 1. HOOK AUTOMÁTICO EN GUARDADO DE PELÍCULAS Y EPISODIOS DOOPLAY
 * ============================================================================
 */
add_action('save_post_movies', 'badrock_dooplay_auto_sync_players', 20, 2);
add_action('save_post_episodes', 'badrock_dooplay_auto_sync_players', 20, 2);

function badrock_dooplay_auto_sync_players($post_id, $post) {
    // Evitar auto-guardados o revisiones
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (wp_is_post_revision($post_id)) return;
    if ($post->post_status !== 'publish' && $post->post_status !== 'draft') return;

    // Verificar si ya fue procesado en esta petición para evitar bucles infinitos
    if (did_action('badrock_dooplay_processed_' . $post_id)) return;
    do_action('badrock_dooplay_processed_' . $post_id);

    $post_type = get_post_type($post_id);

    // Obtener TMDb ID o IMDb ID desde los campos nativos de DooPlay
    // DooPlay guarda el TMDb ID en la meta 'id' o en '_dootvshows_trailer'
    $tmdb_id = get_post_meta($post_id, 'id', true);
    if (empty($tmdb_id)) {
        $tmdb_id = get_post_meta($post_id, 'dt_id', true);
    }
    $imdb_id = get_post_meta($post_id, 'imdb_id', true);

    if (empty($tmdb_id) && empty($imdb_id)) {
        return; // Sin identificador válido
    }

    $lookup_id = !empty($tmdb_id) ? $tmdb_id : $imdb_id;

    // Determinar parámetros de temporada y episodio para DooPlay
    $type = ($post_type === 'episodes') ? 'tv' : 'movie';
    $season = 1;
    $episode = 1;

    if ($type === 'tv') {
        $season = intval(get_post_meta($post_id, 'temporada', true));
        $episode = intval(get_post_meta($post_id, 'episodio', true));
        if ($season <= 0) $season = 1;
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
        error_log('[Badrock-DooPlay] Error al contactar Badrock API: ' . $response->get_error_message());
        return;
    }

    $status_code = wp_remote_retrieve_response_code($response);
    if ($status_code !== 200) {
        error_log('[Badrock-DooPlay] Respuesta no-200 de Badrock: HTTP ' . $status_code);
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

    // Estructura de reproductores nativa de DooPlay (`repeatable_fields`)
    // Formato DooPlay:
    // array(
    //     array('name' => 'Servidor VIP', 'select' => 'iframe', 'idioma' => 'Latino', 'url' => 'https://...'),
    // )
    $current_repeatable = get_post_meta($post_id, 'repeatable_fields', true);
    if (!is_array($current_repeatable)) {
        $current_repeatable = array();
    }

    // Filtrar servidores previos de Badrock para no duplicar en re-guardados
    $filtered_repeatable = array();
    foreach ($current_repeatable as $row) {
        $name = isset($row['name']) ? $row['name'] : '';
        if (strpos($name, 'Badrock') === false && strpos($name, 'VIP') === false) {
            $filtered_repeatable[] = $row;
        }
    }

    $badrock_rows = array();

    // 1. Añadir el Embed Principal Badrock Cinema Player
    if (!empty($embed_url)) {
        $badrock_rows[] = array(
            'name'   => '⚡ Badrock Cinema (Multi-Audio)',
            'select' => 'iframe',
            'idioma' => 'Multi',
            'url'    => esc_url_raw($embed_url)
        );
    }

    // 2. Añadir Servidor VIP y servidores individuales scrapeados
    foreach ($servers as $srv) {
        $srv_name = isset($srv['name']) ? $srv['name'] : 'Servidor';
        $is_vip   = !empty($srv['isVip']);
        $lang     = isset($srv['language']) ? $srv['language'] : 'Latino';
        $quality  = isset($srv['quality']) ? $srv['quality'] : '1080p';
        $url      = isset($srv['url']) ? $srv['url'] : '';

        if (empty($url)) continue;

        $title = ($is_vip ? '⭐ Servidor VIP' : '▶ ' . $srv_name) . ' (' . $quality . ')';

        $badrock_rows[] = array(
            'name'   => $title,
            'select' => 'iframe',
            'idioma' => ucfirst(strtolower($lang)),
            'url'    => esc_url_raw($url)
        );
    }

    // Unir servidores nuevos con existentes según la preferencia
    if (BADROCK_PREPEND_PLAYERS) {
        $final_repeatable = array_merge($badrock_rows, $filtered_repeatable);
    } else {
        $final_repeatable = array_merge($filtered_repeatable, $badrock_rows);
    }

    // Actualizar el metadato repeatable_fields de DooPlay
    update_post_meta($post_id, 'repeatable_fields', $final_repeatable);

    // Guardar referencia interna
    update_post_meta($post_id, '_badrock_synced_at', current_time('mysql'));
    update_post_meta($post_id, '_badrock_server_count', count($badrock_rows));
}

/**
 * ============================================================================
 * 2. HOOK PARA EL IMPORTADOR DBMovies (DooPlay AJAX Importer)
 * ============================================================================
 * Cuando dbmovies inserta un nuevo post mediante AJAX, forzar la sincronización
 * inmediata de los reproductores Badrockplyr.
 */
add_action('dbmovies_after_insert_movie', 'badrock_dooplay_dbmovies_hook', 10, 2);
add_action('dbmovies_after_insert_episode', 'badrock_dooplay_dbmovies_hook', 10, 2);

function badrock_dooplay_dbmovies_hook($post_id, $data) {
    if (!empty($post_id)) {
        $post = get_post($post_id);
        if ($post) {
            badrock_dooplay_auto_sync_players($post_id, $post);
        }
    }
}

/**
 * ============================================================================
 * 3. METABOX EN DOOPLAY: BOTÓN DE 1 CLIC PARA SINCRONIZAR REPRODUCTORES
 * ============================================================================
 */
add_action('add_meta_boxes', 'badrock_dooplay_register_sync_metabox');
function badrock_dooplay_register_sync_metabox() {
    $types = array('movies', 'episodes');
    foreach ($types as $type) {
        add_meta_box(
            'badrock_dooplay_box',
            '⚡ Badrockplyr PRO - DooPlay Sync',
            'badrock_dooplay_render_sync_metabox',
            $type,
            'side',
            'high'
        );
    }
}

function badrock_dooplay_render_sync_metabox($post) {
    $synced_at = get_post_meta($post->ID, '_badrock_synced_at', true);
    $server_count = get_post_meta($post->ID, '_badrock_server_count', true);
    ?>
    <div style="font-size: 12px; line-height: 1.5;">
        <p style="margin: 0 0 8px; color: #475569;">
            Sincroniza los servidores de streaming y el Servidor VIP de Badrock directamente en las pestañas de DooPlay:
        </p>

        <?php if (!empty($synced_at)): ?>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px;">
                ✓ <strong><?php echo intval($server_count); ?></strong> servidores vinculados.<br>
                <span style="font-size: 10px; opacity: 0.8;"><?php echo esc_html($synced_at); ?></span>
            </div>
        <?php endif; ?>

        <button type="button" id="badrock-dooplay-sync-btn" class="button button-primary" style="width: 100%; text-align: center; justify-content: center; font-weight: 700;">
            🔄 Sincronizar Streams con Badrock
        </button>
        <span id="badrock-dooplay-status" style="display: block; margin-top: 6px; font-weight: 600; font-size: 11px;"></span>
    </div>

    <script>
    jQuery(document).ready(function($) {
        $('#badrock-dooplay-sync-btn').on('click', function() {
            const btn = $(this);
            const status = $('#badrock-dooplay-status');
            btn.prop('disabled', true).text('Consultando Badrock API...');
            status.html('<span style="color: #0284c7;">Descargando streams...</span>');

            $.post(ajaxurl, {
                action: 'badrock_dooplay_manual_sync',
                post_id: <?php echo $post->ID; ?>,
                nonce: '<?php echo wp_create_nonce("badrock_sync_nonce"); ?>'
            }, function(res) {
                btn.prop('disabled', false).text('🔄 Sincronizar Streams con Badrock');
                if (res.success) {
                    status.html('<span style="color: #16a34a;">✓ Sincronizado. Recargando página...</span>');
                    setTimeout(() => window.location.reload(), 1200);
                } else {
                    status.html('<span style="color: #dc2626;">✗ ' + (res.data || 'Error al sincronizar') + '</span>');
                }
            }).fail(function() {
                btn.prop('disabled', false).text('🔄 Sincronizar Streams con Badrock');
                status.html('<span style="color: #dc2626;">✗ Error de conexión</span>');
            });
        });
    });
    </script>
    <?php
}

add_action('wp_ajax_badrock_dooplay_manual_sync', 'badrock_dooplay_manual_sync_handler');
function badrock_dooplay_manual_sync_handler() {
    check_ajax_referer('badrock_sync_nonce', 'nonce');
    $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
    if (!$post_id || !current_user_can('edit_post', $post_id)) {
        wp_send_json_error('Permisos insuficientes o post inválido.');
    }

    $post = get_post($post_id);
    if (!$post) {
        wp_send_json_error('Contenido no encontrado.');
    }

    badrock_dooplay_auto_sync_players($post_id, $post);
    wp_send_json_success('Servidores sincronizados correctamente en repeatable_fields de DooPlay.');
}

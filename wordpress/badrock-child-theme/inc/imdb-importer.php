<?php
/**
 * Badrockplyr Child Theme - IMDb & TMDb Auto-Importer Metabox
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('add_meta_boxes', 'badrock_register_imdb_metabox');
function badrock_register_imdb_metabox() {
    $post_types = array('post', 'page', 'movies', 'tvshows', 'pelicula', 'serie', 'episode', 'episodio');
    
    foreach ($post_types as $pt) {
        if (post_type_exists($pt)) {
            add_meta_box(
                'badrock_imdb_importer',
                '⚡ Badrock Auto-Importador (IMDb / TMDb)',
                'badrock_render_importer_metabox',
                $pt,
                'normal',
                'high'
            );
        }
    }
}

function badrock_render_importer_metabox($post) {
    wp_nonce_field('badrock_save_meta', 'badrock_meta_nonce');

    $tmdb_id = get_post_meta($post->ID, '_badrock_tmdb_id', true);
    $imdb_id = get_post_meta($post->ID, '_badrock_imdb_id', true);
    $embed_url = get_post_meta($post->ID, '_badrock_embed_url', true);
    $servers_json = get_post_meta($post->ID, '_badrock_servers_json', true);
    $servers = !empty($servers_json) ? json_decode($servers_json, true) : array();
    $player_mode = get_post_meta($post->ID, '_badrock_player_mode', true);
    if (!$player_mode) {
        $player_mode = get_option('badrock_player_mode', 'embed_iframe');
    }
    ?>
    <div style="background: #090b12; color: #f1f5f9; padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">
                    ID de IMDb (ej: tt15398776) o TMDb:
                </label>
                <input type="text" id="badrock_input_id" value="<?php echo esc_attr($imdb_id ? $imdb_id : $tmdb_id); ?>" placeholder="tt15398776 o 872585" style="width: 100%; background: #131726; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px 12px; border-radius: 8px;" />
            </div>

            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">
                    Tipo de Contenido:
                </label>
                <select id="badrock_input_type" style="width: 100%; background: #131726; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px 12px; border-radius: 8px;">
                    <option value="movie">Película</option>
                    <option value="tv">Serie / TV Show</option>
                    <option value="anime">Anime</option>
                </select>
            </div>

            <div id="badrock_series_fields" style="display: none;">
                <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">
                    Temporada / Episodio:
                </label>
                <div style="display: flex; gap: 8px;">
                    <input type="number" id="badrock_input_season" placeholder="Temp" value="1" min="1" style="width: 50%; background: #131726; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px; border-radius: 8px;" />
                    <input type="number" id="badrock_input_episode" placeholder="Ep" value="1" min="1" style="width: 50%; background: #131726; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px; border-radius: 8px;" />
                </div>
            </div>

            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">
                    Modo de Reproductor:
                </label>
                <select name="badrock_player_mode" id="badrock_player_mode" style="width: 100%; background: #131726; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px 12px; border-radius: 8px;">
                    <option value="embed_iframe" <?php selected($player_mode, 'embed_iframe'); ?>>Incrustar Reproductor Badrock</option>
                    <option value="raw_servers" <?php selected($player_mode, 'raw_servers'); ?>>Pestañas de Enlaces Crudos</option>
                </select>
            </div>
        </div>

        <div style="display: flex; gap: 10px; align-items: center; margin-top: 15px;">
            <button type="button" id="badrock_fetch_btn" class="button button-primary" style="background: #06b6d4; border-color: #0891b2; font-weight: 700; padding: 6px 18px; border-radius: 8px; height: auto;">
                📥 Importar con Badrock
            </button>
            <span id="badrock_import_status" style="font-size: 13px; font-weight: 600;"></span>
        </div>

        <!-- Hidden inputs to persist scraped data in WordPress -->
        <input type="hidden" name="badrock_tmdb_id" id="badrock_tmdb_id" value="<?php echo esc_attr($tmdb_id); ?>" />
        <input type="hidden" name="badrock_imdb_id" id="badrock_imdb_id" value="<?php echo esc_attr($imdb_id); ?>" />
        <input type="hidden" name="badrock_embed_url" id="badrock_embed_url" value="<?php echo esc_attr($embed_url); ?>" />
        <input type="hidden" name="badrock_servers_json" id="badrock_servers_json" value="<?php echo esc_attr($servers_json); ?>" />

        <!-- Preview of Servers Found -->
        <div id="badrock_servers_preview" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.08); <?php echo empty($servers) ? 'display:none;' : ''; ?>">
            <div style="font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 8px;">
                Servidores Scrapeados Vinculados (<span id="badrock_server_count"><?php echo count($servers); ?></span> disponibles):
            </div>
            <div id="badrock_servers_list" style="display: flex; flex-wrap: wrap; gap: 8px;">
                <?php foreach ($servers as $srv): ?>
                    <span style="font-size: 11px; padding: 4px 10px; border-radius: 6px; background: <?php echo !empty($srv['isVip']) ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'; ?>; color: <?php echo !empty($srv['isVip']) ? '#fbbf24' : '#e2e8f0'; ?>; border: 1px solid <?php echo !empty($srv['isVip']) ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)'; ?>;">
                        <?php echo esc_html($srv['name']); ?> (<?php echo esc_html($srv['language']); ?> - <?php echo esc_html($srv['quality']); ?>)
                    </span>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <script>
    jQuery(document).ready(function($) {
        $('#badrock_input_type').on('change', function() {
            if ($(this).val() === 'tv' || $(this).val() === 'anime') {
                $('#badrock_series_fields').show();
            } else {
                $('#badrock_series_fields').hide();
            }
        });

        $('#badrock_fetch_btn').on('click', function() {
            const inputId = $('#badrock_input_id').val().trim();
            const mediaType = $('#badrock_input_type').val();
            const season = $('#badrock_input_season').val();
            const episode = $('#badrock_input_episode').val();
            const statusEl = $('#badrock_import_status');

            if (!inputId) {
                statusEl.html('<span style="color: #ef4444;">Por favor introduce un ID de IMDb o TMDb.</span>');
                return;
            }

            statusEl.html('<span style="color: #06b6d4;">Consultando Badrock API...</span>');

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'badrock_ajax_fetch',
                    id: inputId,
                    type: mediaType,
                    season: season,
                    episode: episode
                },
                success: function(response) {
                    if (response.success && response.data) {
                        const data = response.data;
                        statusEl.html('<span style="color: #10b981;">✓ ' + data.title + ' importado con ' + (data.servers ? data.servers.length : 0) + ' servidores.</span>');

                        // Fill Title and Content in standard WordPress Editor
                        if ($('#title').length && !$('#title').val()) {
                            $('#title').val(data.title);
                        }
                        if ($('#content').length && !$('#content').val()) {
                            $('#content').val(data.overview);
                        }

                        // Store in hidden fields
                        $('#badrock_tmdb_id').val(data.tmdbId || '');
                        $('#badrock_imdb_id').val(data.imdbId || '');
                        $('#badrock_embed_url').val(data.embedPlayerUrl || '');
                        $('#badrock_servers_json').val(JSON.stringify(data.servers || []));

                        // Render servers preview
                        if (data.servers && data.servers.length) {
                            $('#badrock_server_count').text(data.servers.length);
                            let html = '';
                            data.servers.forEach(srv => {
                                const isVip = srv.isVip;
                                html += '<span style="font-size: 11px; padding: 4px 10px; border-radius: 6px; background: ' + (isVip ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)') + '; color: ' + (isVip ? '#fbbf24' : '#e2e8f0') + '; border: 1px solid ' + (isVip ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)') + ';">' + srv.name + ' (' + srv.language + ' - ' + srv.quality + ')</span>';
                            });
                            $('#badrock_servers_list').html(html);
                            $('#badrock_servers_preview').show();
                        }
                    } else {
                        statusEl.html('<span style="color: #ef4444;">✗ ' + (response.data?.message || 'Error al obtener datos') + '</span>');
                    }
                },
                error: function(err) {
                    statusEl.html('<span style="color: #ef4444;">✗ Error de conexión con el servidor.</span>');
                }
            });
        });
    });
    </script>
    <?php
}

// Handle AJAX Fetch in WordPress Backend
add_action('wp_ajax_badrock_ajax_fetch', 'badrock_ajax_fetch_handler');
function badrock_ajax_fetch_handler() {
    $api_url = rtrim(get_option('badrock_api_url', 'http://localhost:3000'), '/');
    $api_key = get_option('badrock_api_key', '');
    $id = isset($_POST['id']) ? sanitize_text_field($_POST['id']) : '';
    $type = isset($_POST['type']) ? sanitize_text_field($_POST['type']) : 'movie';
    $season = isset($_POST['season']) ? intval($_POST['season']) : 1;
    $episode = isset($_POST['episode']) ? intval($_POST['episode']) : 1;

    if (empty($id)) {
        wp_send_json_error(array('message' => 'ID no proporcionado.'));
    }

    $endpoint = $api_url . '/api/v1/media/' . urlencode($id) . '?type=' . urlencode($type) . '&season=' . $season . '&episode=' . $episode;

    $response = wp_remote_get($endpoint, array(
        'timeout' => 25,
        'headers' => array(
            'X-Badrock-Key' => $api_key,
            'Accept' => 'application/json'
        )
    ));

    if (is_wp_error($response)) {
        wp_send_json_error(array('message' => $response->get_error_message()));
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if (isset($data['success']) && $data['success'] && isset($data['data'])) {
        wp_send_json_success($data['data']);
    } else {
        $msg = isset($data['error']) ? $data['error'] : 'No se encontraron resultados para este ID.';
        wp_send_json_error(array('message' => $msg));
    }
}

// Save Metabox Data
add_action('save_post', 'badrock_save_metabox_data');
function badrock_save_metabox_data($post_id) {
    if (!isset($_POST['badrock_meta_nonce']) || !wp_verify_nonce($_POST['badrock_meta_nonce'], 'badrock_save_meta')) {
        return;
    }
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!current_user_can('edit_post', $post_id)) return;

    if (isset($_POST['badrock_tmdb_id'])) {
        update_post_meta($post_id, '_badrock_tmdb_id', sanitize_text_field($_POST['badrock_tmdb_id']));
    }
    if (isset($_POST['badrock_imdb_id'])) {
        update_post_meta($post_id, '_badrock_imdb_id', sanitize_text_field($_POST['badrock_imdb_id']));
    }
    if (isset($_POST['badrock_embed_url'])) {
        update_post_meta($post_id, '_badrock_embed_url', esc_url_raw($_POST['badrock_embed_url']));
    }
    if (isset($_POST['badrock_servers_json'])) {
        update_post_meta($post_id, '_badrock_servers_json', wp_kses_post($_POST['badrock_servers_json']));
    }
    if (isset($_POST['badrock_player_mode'])) {
        update_post_meta($post_id, '_badrock_player_mode', sanitize_text_field($_POST['badrock_player_mode']));
    }
}

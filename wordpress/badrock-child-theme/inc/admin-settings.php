<?php
/**
 * Badrockplyr Child Theme - Admin Settings Panel
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('admin_menu', 'badrock_add_admin_menu');
function badrock_add_admin_menu() {
    add_menu_page(
        'Badrock API Settings',
        'Badrock Player',
        'manage_options',
        'badrock-settings',
        'badrock_render_settings_page',
        'dashicons-video-alt3',
        65
    );
}

add_action('admin_init', 'badrock_register_settings');
function badrock_register_settings() {
    register_setting('badrock_settings_group', 'badrock_api_url', array(
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default' => 'http://localhost:3000'
    ));

    register_setting('badrock_settings_group', 'badrock_api_key', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => ''
    ));

    register_setting('badrock_settings_group', 'badrock_disable_native_imdb', array(
        'type' => 'boolean',
        'default' => 0
    ));

    register_setting('badrock_settings_group', 'badrock_player_mode', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => 'embed_iframe'
    ));
}

function badrock_render_settings_page() {
    ?>
    <div class="wrap" style="max-width: 900px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, sans-serif;">
        <div style="background: linear-gradient(135deg, #090b12 0%, #131726 100%); color: #fff; padding: 24px 30px; border-radius: 14px; margin: 20px 0; border: 1px solid rgba(6,182,212,0.3); box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">
                        BADROCK<span style="color: #06b6d4;">PLYR</span> PRO
                    </h1>
                    <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">
                        Configuración de la API y Enlace con WordPress Child Theme
                    </p>
                </div>
                <span style="background: rgba(6,182,212,0.15); color: #06b6d4; border: 1px solid rgba(6,182,212,0.4); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">
                    v2.0.0 CONNECTED
                </span>
            </div>
        </div>

        <form method="post" action="options.php" style="background: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <?php settings_fields('badrock_settings_group'); ?>
            <?php do_settings_sections('badrock_settings_group'); ?>

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row" style="font-weight: 600;">URL del Servidor Badrock</th>
                    <td>
                        <input type="url" name="badrock_api_url" id="badrock_api_url" value="<?php echo esc_attr(get_option('badrock_api_url', 'http://localhost:3000')); ?>" class="regular-text" placeholder="https://tu-badrock-instancia.com" required style="width: 100%; max-width: 480px; padding: 8px 12px;" />
                        <p class="description">La URL base donde está alojada tu plataforma Badrockplyr (sin barra final).</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row" style="font-weight: 600;">Badrock API Key</th>
                    <td>
                        <input type="password" name="badrock_api_key" id="badrock_api_key" value="<?php echo esc_attr(get_option('badrock_api_key')); ?>" class="regular-text" placeholder="bdrk_live_xxxxxxxxxxxxxxxx" style="width: 100%; max-width: 480px; padding: 8px 12px;" />
                        <button type="button" class="button" onclick="const f=document.getElementById('badrock_api_key'); f.type=f.type==='password'?'text':'password';">Ver</button>
                        <p class="description">Genera esta clave en tu panel de Badrock en <strong>Consola > API Keys</strong>.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row" style="font-weight: 600;">Modo de Visualización por Defecto</th>
                    <td>
                        <select name="badrock_player_mode" id="badrock_player_mode" style="padding: 8px 12px; width: 100%; max-width: 320px;">
                            <option value="embed_iframe" <?php selected(get_option('badrock_player_mode', 'embed_iframe'), 'embed_iframe'); ?>>
                                Reproductor Embed Incrustado (Recomendado)
                            </option>
                            <option value="raw_servers" <?php selected(get_option('badrock_player_mode'), 'raw_servers'); ?>>
                                Pestañas de Enlaces Crudos / Múltiples Servidores
                            </option>
                        </select>
                        <p class="description">Elige si deseas que se inserte el reproductor limpio de Badrock o las pestañas con los links directos de los servidores.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row" style="font-weight: 600;">Anular API de IMDb Nativa del Tema</th>
                    <td>
                        <label for="badrock_disable_native_imdb">
                            <input type="checkbox" name="badrock_disable_native_imdb" id="badrock_disable_native_imdb" value="1" <?php checked(get_option('badrock_disable_native_imdb'), 1); ?> />
                            Desactivar campos nativos de IMDb/TMDb del tema padre para evitar cruces
                        </label>
                        <p class="description">Activa esta casilla si tu tema padre (ej. DooPlay o ToroFlix) tiene un importador propio que causa conflicto al importar datos.</p>
                    </td>
                </tr>
            </table>

            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; gap: 15px; align-items: center;">
                <?php submit_button('Guardar Configuración', 'primary', 'submit', false); ?>
                <button type="button" id="badrock-test-api" class="button button-secondary" style="height: 38px;">Probar Conexión con Badrock</button>
                <span id="badrock-test-status" style="font-weight: 600; font-size: 13px;"></span>
            </div>
        </form>
    </div>

    <script>
    document.getElementById('badrock-test-api').addEventListener('click', function() {
        const statusEl = document.getElementById('badrock-test-status');
        const apiUrl = document.getElementById('badrock_api_url').value.replace(/\/$/, '');
        const apiKey = document.getElementById('badrock_api_key').value;

        if (!apiUrl || !apiKey) {
            statusEl.innerHTML = '<span style="color: #ef4444;">Por favor introduce la URL y API Key antes de probar.</span>';
            return;
        }

        statusEl.innerHTML = '<span style="color: #64748b;">Conectando con Badrock...</span>';

        fetch(apiUrl + '/api/v1/media/550', {
            headers: {
                'X-Badrock-Key': apiKey,
                'Accept': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                statusEl.innerHTML = '<span style="color: #10b981;">✓ Conexión Exitosa. Título de prueba recibido: ' + (data.data?.title || 'OK') + '</span>';
            } else {
                statusEl.innerHTML = '<span style="color: #ef4444;">✗ Error de API: ' + (data.error || 'Clave inválida') + '</span>';
            }
        })
        .catch(err => {
            statusEl.innerHTML = '<span style="color: #ef4444;">✗ No se pudo conectar con el servidor: ' + err.message + '</span>';
        });
    });
    </script>
    <?php
}

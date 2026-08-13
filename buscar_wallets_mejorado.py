from mnemonic import Mnemonic
import requests
import time
import os
from colorama import init, Fore
from eth_account import Account
from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes

init(autoreset=True)

def reproducir_sonido():
    try:
        import winsound
        winsound.Beep(2000, 150)
        winsound.Beep(2500, 250)
    except Exception:
        print('\a', end='', flush=True)

# ─── Configuración de archivos ────────────────────────────────────────────────
INPUT_FILE      = "seeds_200k.txt"
OUTPUT_FILE     = "wallets_con_saldo_mejorado.txt"
CHECKPOINT_FILE = "ultima_posicion_mejorada.txt"
BATCH_SIZE      = 100

# ─── Dashboard API (opcional) ─────────────────────────────────────────────────
# Si tienes el dashboard desplegado en Vercel, pon la URL y la clave aquí.
# Si quieres correr solo el script sin dashboard, deja en None.
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", None)   # Ej: "https://mi-dashboard.vercel.app"
SCANNER_API_KEY = os.environ.get("SCANNER_API_KEY", None)

STATS_REPORT_INTERVAL = 50  # Reportar progreso cada N frases

# ─── Setup ────────────────────────────────────────────────────────────────────
Account.enable_unaudited_hdwallet_features()
mnemo = Mnemonic("english")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def guardar_checkpoint(posicion):
    with open(CHECKPOINT_FILE, 'w') as f:
        f.write(str(posicion))

def cargar_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            return int(f.read().strip())
    return 0

def api_headers():
    return {"x-api-key": SCANNER_API_KEY, "Content-Type": "application/json"}

def report_stats(total_phrases, processed, found_wallets, is_running=True):
    """Envía estadísticas de progreso al dashboard."""
    if not DASHBOARD_URL or not SCANNER_API_KEY:
        return
    try:
        requests.post(
            f"{DASHBOARD_URL}/api/stats",
            json={
                "total_phrases": total_phrases,
                "processed": processed,
                "found_wallets": found_wallets,
                "is_running": is_running,
            },
            headers=api_headers(),
            timeout=5,
        )
    except Exception:
        pass  # No bloqueamos el script si el dashboard falla

def report_wallet(phrase, eth_address, eth_balance, sol_address, sol_balance):
    """Envía una wallet encontrada al dashboard."""
    if not DASHBOARD_URL or not SCANNER_API_KEY:
        return
    try:
        requests.post(
            f"{DASHBOARD_URL}/api/wallets",
            json={
                "phrase": phrase,
                "eth_address": eth_address,
                "eth_balance": eth_balance,
                "sol_address": sol_address,
                "sol_balance": sol_balance,
            },
            headers=api_headers(),
            timeout=5,
        )
    except Exception:
        pass

# ─── Derivación de direcciones ────────────────────────────────────────────────

def get_eth_addr_standard(phrase):
    try:
        return Account.from_mnemonic(phrase).address
    except Exception:
        return None

def get_sol_addr_standard(phrase):
    try:
        seed = Bip39SeedGenerator(phrase).Generate()
        mst = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
        acc = mst.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        return acc.PublicKey().ToAddress()
    except Exception:
        return None

# ─── Consultas RPC en lote ────────────────────────────────────────────────────

def check_eth_batch(addresses):
    if not addresses:
        return {}
    rpcs = [
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com"
    ]
    payload = [
        {"jsonrpc": "2.0", "id": i, "method": "eth_getBalance", "params": [addr, "latest"]}
        for i, addr in enumerate(addresses)
    ]
    for url in rpcs:
        for attempt in range(3):
            try:
                r = requests.post(url, json=payload, timeout=10)
                if r.status_code == 200:
                    results = r.json()
                    if isinstance(results, list):
                        balances = {}
                        for res in results:
                            idx = res.get("id")
                            if "result" in res:
                                bal = int(res["result"], 16) / 10**18
                                balances[addresses[idx]] = bal
                            else:
                                balances[addresses[idx]] = 0.0
                        return balances
                elif r.status_code == 429:
                    time.sleep(2 * (attempt + 1))
            except Exception:
                time.sleep(1.0)
    return {addr: 0.0 for addr in addresses}

def check_sol_batch(addresses):
    if not addresses:
        return {}
    rpcs = [
        "https://api.mainnet-beta.solana.com",
        "https://solana-rpc.publicnode.com"
    ]
    payload = [
        {"jsonrpc": "2.0", "id": i, "method": "getBalance", "params": [addr]}
        for i, addr in enumerate(addresses)
    ]
    for url in rpcs:
        for attempt in range(3):
            try:
                r = requests.post(url, json=payload, timeout=10)
                if r.status_code == 200:
                    results = r.json()
                    if isinstance(results, list):
                        balances = {}
                        for res in results:
                            idx = res.get("id")
                            if "result" in res and "value" in res["result"]:
                                bal = res["result"]["value"] / 10**9
                                balances[addresses[idx]] = bal
                            else:
                                balances[addresses[idx]] = 0.0
                        return balances
                elif r.status_code == 429:
                    time.sleep(2 * (attempt + 1))
            except Exception:
                time.sleep(1.0)
    return {addr: 0.0 for addr in addresses}

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"{Fore.RED}Error: No se encontró el archivo '{INPUT_FILE}'")
        return

    print("Cargando frases mnemónicas...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        frases = [line.strip() for line in f if line.strip()]

    total = len(frases)
    print(f"Total frases cargadas: {total}")

    inicio = cargar_checkpoint()
    print(f"Comenzando desde el índice: {inicio}")

    if DASHBOARD_URL:
        print(f"{Fore.CYAN}Dashboard: {DASHBOARD_URL}")
        report_stats(total, inicio, 0, is_running=True)

    encontradas = 0

    for index in range(inicio, total, BATCH_SIZE):
        lote_frases = frases[index: index + BATCH_SIZE]

        # Validar y derivar direcciones
        valid_items = []
        for frase in lote_frases:
            if not mnemo.check(frase):
                print(f"{Fore.RED}[INVÁLIDA]{Fore.RESET} {frase}")
                continue
            eth_addr = get_eth_addr_standard(frase)
            sol_addr = get_sol_addr_standard(frase)
            if eth_addr and sol_addr:
                valid_items.append((frase, eth_addr, sol_addr))

        if not valid_items:
            guardar_checkpoint(index + len(lote_frases))
            continue

        eth_addrs = [item[1] for item in valid_items]
        sol_addrs = [item[2] for item in valid_items]

        eth_balances = check_eth_batch(eth_addrs)
        sol_balances = check_sol_batch(sol_addrs)

        for frase, eth_addr, sol_addr in valid_items:
            eth_bal = eth_balances.get(eth_addr, 0.0)
            sol_bal = sol_balances.get(sol_addr, 0.0)

            print(f"{Fore.CYAN}[VÁLIDA]{Fore.RESET}   {frase}")
            print(f"  ├─ ETH: {Fore.YELLOW}{eth_addr}{Fore.RESET} | Saldo: "
                  f"{Fore.GREEN if eth_bal > 0 else Fore.LIGHTBLACK_EX}{eth_bal:.6f} ETH{Fore.RESET}")
            print(f"  └─ SOL: {Fore.YELLOW}{sol_addr}{Fore.RESET} | Saldo: "
                  f"{Fore.GREEN if sol_bal > 0 else Fore.LIGHTBLACK_EX}{sol_bal:.6f} SOL{Fore.RESET}")

            if eth_bal > 0 or sol_bal > 0:
                encontradas += 1
                reproducir_sonido()
                print(f"\n{Fore.GREEN}💰 ¡WALLET CON SALDO ENCONTRADA!")
                print(f"Frase: {frase}")
                print(f"ETH ({eth_addr}): {eth_bal:.6f} ETH")
                print(f"SOL ({sol_addr}): {sol_bal:.6f} SOL\n")

                with open(OUTPUT_FILE, 'a') as out_f:
                    out_f.write(f"\n{'='*60}\n")
                    out_f.write(f"Frase: {frase}\n")
                    if eth_bal > 0:
                        out_f.write(f"ETH: {eth_addr} | {eth_bal:.6f} ETH\n")
                    if sol_bal > 0:
                        out_f.write(f"SOL: {sol_addr} | {sol_bal:.6f} SOL\n")

                # ← Reportar al dashboard en tiempo real
                report_wallet(frase, eth_addr, eth_bal, sol_addr, sol_bal)

        # Progreso
        progreso = min(index + BATCH_SIZE, total)
        porcentaje = (progreso / total) * 100
        print(f"\nProgreso: [{progreso}/{total}] {porcentaje:.2f}% | Encontradas: {encontradas}\n")
        guardar_checkpoint(progreso)

        # Reportar stats al dashboard cada STATS_REPORT_INTERVAL frases
        if (progreso // BATCH_SIZE) % (STATS_REPORT_INTERVAL // BATCH_SIZE + 1) == 0:
            report_stats(total, progreso, encontradas)

        time.sleep(0.3)

    # Marcar como finalizado
    report_stats(total, total, encontradas, is_running=False)
    print(f"\nProceso finalizado. Total de wallets encontradas: {encontradas}")


if __name__ == "__main__":
    main()

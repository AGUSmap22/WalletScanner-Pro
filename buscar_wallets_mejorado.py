from mnemonic import Mnemonic
import requests
import time
import os
from colorama import init, Fore
from eth_account import Account
from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes, Bip84, Bip84Coins

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
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", None)   # Ej: "https://mi-dashboard.vercel.app"
SCANNER_API_KEY = os.environ.get("SCANNER_API_KEY", None)

STATS_REPORT_INTERVAL = 50  # Reportar progreso cada N frases

# ─── Setup ────────────────────────────────────────────────────────────────────
Account.enable_unaudited_hdwallet_features()
mnemo = Mnemonic("english")

# ─── Helpers Checkpoint ───────────────────────────────────────────────────────

def guardar_checkpoint(posicion):
    """Guarda el checkpoint de forma atómica para evitar archivos corruptos de 0 bytes."""
    temp_file = CHECKPOINT_FILE + ".tmp"
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(str(posicion))
        os.replace(temp_file, CHECKPOINT_FILE)
    except Exception as e:
        print(f"{Fore.YELLOW}Advertencia guardando checkpoint: {e}")

def cargar_checkpoint():
    """Carga la posición del checkpoint. Si el archivo está vacío o corrupto, retorna 0."""
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    return int(content)
        except (ValueError, Exception) as e:
            print(f"{Fore.YELLOW}Archivo de checkpoint inválido ({e}). Reiniciando desde el índice 0.")
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
        pass

def report_wallet(phrase, eth_address, eth_balance, sol_address, sol_balance, bsc_address=None, bsc_balance=0, btc_address=None, btc_balance=0):
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
                "bsc_address": bsc_address,
                "bsc_balance": bsc_balance,
                "btc_address": btc_address,
                "btc_balance": btc_balance,
            },
            headers=api_headers(),
            timeout=5,
        )
    except Exception:
        pass

# ─── Derivación de direcciones ────────────────────────────────────────────────

def get_eth_addr_standard(phrase):
    """Deriva la dirección EVM (Ethereum / BSC)."""
    try:
        return Account.from_mnemonic(phrase).address
    except Exception:
        return None

def get_sol_addr_standard(phrase):
    """Deriva la dirección Solana (BIP44)."""
    try:
        seed = Bip39SeedGenerator(phrase).Generate()
        mst = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
        acc = mst.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        return acc.PublicKey().ToAddress()
    except Exception:
        return None

def get_btc_addr_standard(phrase):
    """Deriva la dirección Bitcoin Native SegWit bc1q... (BIP84)."""
    try:
        seed = Bip39SeedGenerator(phrase).Generate()
        acc = Bip84.FromSeed(seed, Bip84Coins.BITCOIN).Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
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

def check_bsc_batch(addresses):
    if not addresses:
        return {}
    rpcs = [
        "https://bsc-rpc.publicnode.com",
        "https://binance.llamarpc.com",
        "https://bsc-dataseed.binance.org"
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
        "https://solana-rpc.publicnode.com",
        "https://rpc.ankr.com/solana",
        "https://solana.llamarpc.com"
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

def check_btc_batch(addresses):
    if not addresses:
        return {}
    url = f"https://blockchain.info/balance?active={','.join(addresses)}"
    headers = {"User-Agent": "Mozilla/5.0"}
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                balances = {}
                for addr in addresses:
                    if addr in data:
                        satoshis = data[addr].get("final_balance", 0)
                        balances[addr] = satoshis / 10**8
                    else:
                        balances[addr] = 0.0
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
            eth_addr = get_eth_addr_standard(frase)  # Sirve para ETH y BSC (EVM)
            sol_addr = get_sol_addr_standard(frase)
            btc_addr = get_btc_addr_standard(frase)
            if eth_addr and sol_addr and btc_addr:
                valid_items.append((frase, eth_addr, sol_addr, btc_addr))

        if not valid_items:
            guardar_checkpoint(index + len(lote_frases))
            continue

        eth_addrs = list(set([item[1] for item in valid_items]))
        sol_addrs = [item[2] for item in valid_items]
        btc_addrs = [item[3] for item in valid_items]

        # Consultar balances en lote por red
        eth_balances = check_eth_batch(eth_addrs)
        bsc_balances = check_bsc_batch(eth_addrs)
        sol_balances = check_sol_batch(sol_addrs)
        btc_balances = check_btc_batch(btc_addrs)

        for frase, eth_addr, sol_addr, btc_addr in valid_items:
            eth_bal = eth_balances.get(eth_addr, 0.0)
            bsc_bal = bsc_balances.get(eth_addr, 0.0)
            sol_bal = sol_balances.get(sol_addr, 0.0)
            btc_bal = btc_balances.get(btc_addr, 0.0)

            print(f"{Fore.CYAN}[VÁLIDA]{Fore.RESET}   {frase}")
            print(f"  ├─ ETH: {Fore.YELLOW}{eth_addr}{Fore.RESET} | Saldo: "
                  f"{Fore.GREEN if eth_bal > 0 else Fore.LIGHTBLACK_EX}{eth_bal:.6f} ETH{Fore.RESET}")
            print(f"  ├─ BSC: {Fore.YELLOW}{eth_addr}{Fore.RESET} | Saldo: "
                  f"{Fore.GREEN if bsc_bal > 0 else Fore.LIGHTBLACK_EX}{bsc_bal:.6f} BNB{Fore.RESET}")
            print(f"  ├─ BTC: {Fore.YELLOW}{btc_addr}{Fore.RESET} | Saldo: "
                  f"{Fore.GREEN if btc_bal > 0 else Fore.LIGHTBLACK_EX}{btc_bal:.8f} BTC{Fore.RESET}")
            print(f"  └─ SOL: {Fore.YELLOW}{sol_addr}{Fore.RESET} | Saldo: "
                  f"{Fore.GREEN if sol_bal > 0 else Fore.LIGHTBLACK_EX}{sol_bal:.6f} SOL{Fore.RESET}")

            if eth_bal > 0 or bsc_bal > 0 or btc_bal > 0 or sol_bal > 0:
                encontradas += 1
                reproducir_sonido()
                print(f"\n{Fore.GREEN}💰 ¡WALLET CON SALDO ENCONTRADA!")
                print(f"Frase: {frase}")
                if eth_bal > 0: print(f"ETH ({eth_addr}): {eth_bal:.6f} ETH")
                if bsc_bal > 0: print(f"BSC ({eth_addr}): {bsc_bal:.6f} BNB")
                if btc_bal > 0: print(f"BTC ({btc_addr}): {btc_bal:.8f} BTC")
                if sol_bal > 0: print(f"SOL ({sol_addr}): {sol_bal:.6f} SOL\n")

                with open(OUTPUT_FILE, 'a', encoding='utf-8') as out_f:
                    out_f.write(f"\n{'='*60}\n")
                    out_f.write(f"Frase: {frase}\n")
                    if eth_bal > 0:
                        out_f.write(f"ETH: {eth_addr} | {eth_bal:.6f} ETH\n")
                    if bsc_bal > 0:
                        out_f.write(f"BSC: {eth_addr} | {bsc_bal:.6f} BNB\n")
                    if btc_bal > 0:
                        out_f.write(f"BTC: {btc_addr} | {btc_bal:.8f} BTC\n")
                    if sol_bal > 0:
                        out_f.write(f"SOL: {sol_addr} | {sol_bal:.6f} SOL\n")

                # Reportar al dashboard en tiempo real
                report_wallet(frase, eth_addr, eth_bal, sol_addr, sol_bal, eth_addr, bsc_bal, btc_addr, btc_bal)

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

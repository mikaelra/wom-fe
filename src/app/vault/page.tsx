'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { BACKEND_URL } from '@/config';

const VaultScene = dynamic(() => import('@/components/vault/VaultScene'), { ssr: false });

interface VaultResult {
  first: boolean;
  seen_before?: number;
  og_keyfinder: string;
}

export default function VaultPage() {
  const [keycode, setKeycode] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [vaultResult, setVaultResult] = useState<VaultResult | null>(null);

  const checkKeycode = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/vault_check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: keycode }),
      });

      if (!res.ok) {
        alert('Wrong code! Try again.');
        return;
      }

      const json = await res.json();
      sessionStorage.setItem('vault_code', keycode);
      setVaultResult(json);
      setIsCorrect(true);
    } catch (err) {
      console.error('Error checking code:', err);
      alert('Server error. Try again later.');
    }
  };

  if (isCorrect && vaultResult) {
    return <InsideVault vaultResult={vaultResult} />;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8" style={{ background: '#0a0a1a', position: 'relative' }}>
      <VaultScene />
      <div
        className="w-full max-w-3xl flex flex-col items-center rounded-2xl shadow-xl bg-white/80 backdrop-blur-sm transition-all duration-300 p-8"
        style={{ color: 'black', position: 'relative', zIndex: 1 }}
      >
        <h3 className="font-semibold text-xl text-gray-800 mb-4">The Vault of Artifacts</h3>
        <p>In this vault lies ancient artifacts.</p>
        <p>Relics of the past.</p>
        <p>Lucky players will get the key to the first artifact.</p>
        <p>Everytime you win the raid, there is a 1 in 1000 chance to get the key.</p>
        <p>The first person to find the key, will have their name forever etched in this game.</p>
        <p>Their name will become an additional key to the artifact.</p>
        <p>The key will be an 8 digit number.</p>
        <p className="mt-4 font-bold">Do you have the key?</p>

        <input
          type="text"
          value={keycode}
          onChange={(e) => setKeycode(e.target.value)}
          maxLength={8}
          className="mt-4 p-2 border rounded"
          placeholder="Enter 8-digit code"
        />
        <button
          onClick={checkKeycode}
          style={{
            marginTop: '10px',
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Unlock Vault
        </button>

        <div className="mt-4">
          <Link href="/" className="underline text-blue-600" style={{ fontSize: '2rem', marginRight: '20px' }}>
            ← Back to Home 🏠
          </Link>
        </div>
      </div>
    </div>
  );
}

function InsideVault({ vaultResult }: { vaultResult: VaultResult }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [error, setError] = useState('');

  const vaultCode = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('vault_code') || '' : '';

  const handleNameSubmit = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/vault_register_name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: vaultCode, name }),
      });
      const json = await res.json();
      if (json.success) {
        setNameSubmitted(true);
      } else {
        setError('Name already claimed!');
      }
    } catch (err) {
      console.error('Error submitting name:', err);
      setError('Server error. Try again.');
    }
  };

  const handleEmailSubmit = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/vault_register_email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: vaultCode, email }),
      });
      const json = await res.json();
      if (json.success) {
        setEmailSubmitted(true);
      } else {
        setError('Email already claimed or you are not first!');
      }
    } catch (err) {
      console.error('Error submitting email:', err);
      setError('Server error. Try again.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8">
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          background: 'white',
          borderRadius: '20px',
          padding: '40px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          textAlign: 'center',
          color: 'black',
        }}
      >
        {vaultResult.first ? (
          <>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>🎉 Congrats! You are the first one to reach the vault! 🎉</h2>
            <p>Leave your name and/or email to claim special rewards!</p>

            {!nameSubmitted && (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  style={{
                    marginTop: '20px',
                    padding: '10px',
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                  }}
                />
                <button
                  onClick={handleNameSubmit}
                  style={{
                    marginTop: '10px',
                    padding: '10px 20px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Submit Name
                </button>
              </>
            )}

            {!emailSubmitted && (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your Email"
                  style={{
                    marginTop: '20px',
                    padding: '10px',
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                  }}
                />
                <button
                  onClick={handleEmailSubmit}
                  style={{
                    marginTop: '10px',
                    padding: '10px 20px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Submit Email
                </button>
              </>
            )}

            {(nameSubmitted || emailSubmitted) && (
              <p style={{ marginTop: '20px', color: 'green', fontWeight: 'bold' }}>
                ✅ Thanks for submitting!
              </p>
            )}
          </>
        ) : (
          <>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Welcome to the Vault!</h2>
            {vaultResult.og_keyfinder === '' && (
              <>
                <p>Noone has claimed the name yet.</p>
                <p>Now is your chance.</p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  style={{
                    marginTop: '20px',
                    padding: '10px',
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                  }}
                />
                <button
                  onClick={handleNameSubmit}
                  style={{
                    marginTop: '10px',
                    padding: '10px 20px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Submit Name
                </button>
              </>
            )}
            <p style={{ marginTop: '20px' }}>You can share the vault code freely!</p>
            <p>{vaultResult.seen_before} players have been in the vault before you.</p>
            {vaultResult.og_keyfinder !== '' && (
              <div>
                <p>The code is &apos;{vaultCode}&apos; and &apos;{vaultResult.og_keyfinder}&apos;.</p>
              </div>
            )}
            <img
              src="/images/artifacts/Elements.svg"
              alt="Artifact"
              style={{ maxWidth: '800px', width: '100%', margin: '0 auto', display: 'block' }}
            />
          </>
        )}
        {error && <p style={{ marginTop: '20px', color: 'red' }}>{error}</p>}
      </div>
    </div>
  );
}

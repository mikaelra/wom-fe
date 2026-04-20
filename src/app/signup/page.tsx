'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL } from '@/config';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSignup = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Please fill in both name and email.');
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/claim_name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError((data as { error?: string }).error ?? 'Signup failed.');
        return;
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerName', name.trim());
        localStorage.setItem('playerEmail', email.trim());
      }
      setError('');
      router.push('/');
    } catch (err) {
      console.error('Signup error:', err);
      setError('Server error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-gray-900">
        <h2 className="text-2xl font-bold text-center mb-6">Create User</h2>
        <input
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-4 p-2 border-2 border-black rounded text-gray-800"
        />
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-6 p-2 border-2 border-black rounded text-gray-800"
        />
        {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
        <button
          type="button"
          onClick={handleSignup}
          className="w-full px-4 py-2 border-2 border-black rounded font-bold bg-gray-200 text-black cursor-pointer"
        >
          Create User
        </button>
        <p className="mt-4 text-center">
          <Link href="/" className="text-blue-600 underline">
            ← Back to Home
          </Link>
        </p>
      </div>
    </div>
  );
}
